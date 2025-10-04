import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { existsSync, readFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import { join } from "path";
import { VectorService, VectorDocument } from "../vector/vector.service";
import { normalizeEnv } from "../utils/env-loader";

import { SupabaseService } from "../supabase/supabase.service";

const LOG_PREFIX = "[ConfluenceAPI]";
const SPACES_PATH = "/wiki/rest/api/space";
const CONTENT_PATH = "/wiki/rest/api/content";
const EXPORT_DIRECTORY = "tmp";
const EXPORT_FILENAME_PREFIX = "confluence-spaces";
const ENV_FILE_NAME = ".env";

let envLoaded = false;

type ConfluenceSpace = {
  id?: string;
  key?: string;
  name?: string;
  _links?: Record<string, unknown>;
};
type ConfluenceContent = Record<string, unknown>;

type ExportVectorOptions = { vectorize?: boolean; pineconeNamespace?: string };
type ExportSummary = {
  file: string;
  spaceCount: number;
  pageCount: number;
  vectorization?: { namespace: string; vectorCount: number };
};

@Injectable()
export class ConfluenceApiService {
  constructor(
    private readonly vectorService: VectorService,
    private readonly supabase: SupabaseService
  ) {}

  async exportAllSpacesContent(
    options: ExportVectorOptions = {}
  ): Promise<ExportSummary> {
    const credentials = await this.resolveCredentials();
    console.log(
      `${LOG_PREFIX} ✅ Using credentials -> URL: ${credentials.confluenceUrl}, EMAIL: ${credentials.email}`
    );

    const spaces = await this.fetchAllSpaces(credentials);
    console.log(`${LOG_PREFIX} 🔎 Found ${spaces.length} spaces`);

    const exportDir = join(process.cwd(), EXPORT_DIRECTORY);
    await mkdir(exportDir, { recursive: true });
    const filePath = join(
      exportDir,
      `${EXPORT_FILENAME_PREFIX}-${Date.now()}.json`
    );

    const outPayload = {
      exportedAt: new Date().toISOString(),
      spaceCount: 0,
      pageCount: 0,
      spaces: [] as Array<{
        space: ConfluenceSpace;
        pages: ConfluenceContent[];
      }>,
    };

    let totalVectors = 0;

    // Проходимо по просторах по черзі — НЕ накопичуємо весь Confluence в пам'яті
    for (const space of spaces) {
      const key = (space.key ?? "").toString();
      if (!key) {
        console.warn(
          `${LOG_PREFIX} ⚠️ Skipping space missing key: ${JSON.stringify(
            space
          ).slice(0, 200)}`
        );
        continue;
      }

      console.log(`${LOG_PREFIX} 🔎 Fetching pages for space ${key}`);
      const pages = await this.fetchAllContentForSpace(credentials, key);
      console.log(`${LOG_PREFIX} 📌 ${key}: ${pages.length} pages`);

      // Додаємо у експорт (файл) — можна зберігати по-space щоб не тримати все
      outPayload.spaces.push({ space, pages });
      outPayload.pageCount += pages.length;

      // Якщо потрібно векторизувати — робимо це прямо зараз (streaming)
      if (options.vectorize && pages.length > 0) {
        const docs: VectorDocument[] = pages.map((page) => {
          const pageId =
            this.normalizeEnv((page?.id as any)?.toString()) ?? randomUUID();
          const title = this.extractString((page as any).title);
          const bodyText = this.normalizeText(this.extractBodyStorage(page));
          const textParts = [
            "Space: " + (space.name ?? key),
            title ? `Title: ${title}` : "",
            bodyText ? `Content: ${bodyText}` : "",
          ].filter(Boolean);
          return {
            id: pageId,
            text: textParts.join("\n"),
            metadata: { source: "confluence", spaceKey: key, pageId, title },
          };
        });

        const namespace =
          options.pineconeNamespace ??
          normalizeEnv(process.env.PINECONE_NAMESPACE) ??
          "test";
        const res = await this.vectorService.embedAndUpsert(docs, {
          namespace,
        });
        totalVectors += res.vectorCount;
      }
    }

    outPayload.spaceCount = outPayload.spaces.length;

    // Запис файлу (можна зробити потоковим записом, але тут простий запис)
    await writeFile(filePath, JSON.stringify(outPayload, null, 2), "utf8");

    console.log(
      `${LOG_PREFIX} ✅ Export complete -> ${outPayload.pageCount} pages from ${outPayload.spaceCount} spaces saved to ${filePath}`
    );

    return {
      file: filePath,
      spaceCount: outPayload.spaceCount,
      pageCount: outPayload.pageCount,
      vectorization: options.vectorize
        ? {
            namespace: options.pineconeNamespace ?? "test",
            vectorCount: totalVectors,
          }
        : undefined,
    };
  }

  private async fetchAllSpaces(credentials: {
    confluenceUrl: string;
    email: string;
    apiKey: string;
  }): Promise<ConfluenceSpace[]> {
    const spaces: ConfluenceSpace[] = [];
    let start = 0;
    const limit = 50;

    while (true) {
      const url = `${credentials.confluenceUrl.replace(
        /\/$/,
        ""
      )}${SPACES_PATH}?limit=${limit}&start=${start}`;
      console.log(`${LOG_PREFIX} GET ${url}`);
      const res = await fetch(url, { headers: this.buildHeaders(credentials) });
      if (!res.ok) await this.handleErrorResponse(res);
      const body = await res.json();
      const results = Array.isArray((body as any).results)
        ? (body as any).results
        : [];
      if (!results.length) break;
      spaces.push(...results);
      start += results.length;
      if (results.length < limit) break;
    }

    return spaces;
  }

  private async fetchAllContentForSpace(
    credentials: { confluenceUrl: string; email: string; apiKey: string },
    spaceKey: string
  ): Promise<ConfluenceContent[]> {
    const pages: ConfluenceContent[] = [];
    let start = 0;
    const limit = 50;

    while (true) {
      const params = new URLSearchParams({
        spaceKey,
        limit: String(limit),
        start: String(start),
        expand: "body.storage,version,history,space",
        type: "page",
        status: "current",
      });
      const url = `${credentials.confluenceUrl.replace(
        /\/$/,
        ""
      )}${CONTENT_PATH}?${params.toString()}`;
      console.log(`${LOG_PREFIX} GET ${url}`);
      const res = await fetch(url, { headers: this.buildHeaders(credentials) });
      if (!res.ok) await this.handleErrorResponse(res);
      const body = await res.json();
      const results = Array.isArray((body as any).results)
        ? (body as any).results
        : [];
      if (!results.length) break;
      pages.push(...results);
      start += results.length;
      if (results.length < limit) break;
    }

    return pages;
  }

  private async resolveCredentials() {
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from("integrations")
      .select("*")
      .eq("type", "atlassian")
      .eq("status", "connected") // якщо маєш статус активності
      .limit(1)
      .single();

    if (error || !data) {
      console.error(
        "[ConfluenceAPI] ❌ Failed to load credentials from Supabase:",
        error
      );
      throw new BadGatewayException(
        "Confluence credentials not found in Supabase"
      );
    }

    console.log("[ConfluenceAPI] 🔑 Loaded credentials from Supabase");

    // 👇 дані з твоєї таблиці
    const { api_email, api_token, config } = data;
    const url =
      (config?.url as string) ??
      data.oauth_authorize_url ??
      "https://webew.atlassian.net/wiki";

    if (!url || !api_email || !api_token) {
      throw new BadGatewayException("Confluence credentials are incomplete");
    }

    return {
      confluenceUrl: url,
      email: api_email,
      apiKey: api_token,
    };
  }

  private buildHeaders({ email, apiKey }: { email: string; apiKey: string }) {
    return {
      Authorization: `Basic ${Buffer.from(`${email}:${apiKey}`).toString(
        "base64"
      )}`,
      Accept: "application/json",
    };
  }

  private async handleErrorResponse(res: Response): Promise<never> {
    let payload: any = null;
    try {
      payload = await res.json();
    } catch (_) {}
    console.error(
      `${LOG_PREFIX} ❌ Confluence API error:`,
      payload || res.statusText
    );
    if (res.status === 401)
      throw new UnauthorizedException("Invalid Confluence credentials");
    if (res.status === 403) throw new ForbiddenException("Access forbidden");
    throw new BadGatewayException(
      payload?.message || `Confluence error ${res.status}`
    );
  }

  private ensureEnvLoaded(): void {
    if (envLoaded) return;
    envLoaded = true;
    try {
      const envPath = join(process.cwd(), ENV_FILE_NAME);
      if (!existsSync(envPath)) {
        console.warn(`${LOG_PREFIX} ⚠️ No ${ENV_FILE_NAME} file found`);
        return;
      }
      const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
      for (const line of lines) {
        if (!line || line.startsWith("#")) continue;
        const sep = line.indexOf("=");
        if (sep < 0) continue;
        const key = line.slice(0, sep).trim();
        const val = line.slice(sep + 1).trim();
        if (!key || process.env[key] !== undefined) continue;
        process.env[key] = this.stripQuotes(val);
      }
      console.log(`${LOG_PREFIX} ✅ Loaded env from ${ENV_FILE_NAME}`);
    } catch (e) {
      console.warn(`${LOG_PREFIX} ❌ Failed to load ${ENV_FILE_NAME}`, e);
    }
  }

  private normalizeEnv(value?: string | null): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed ? this.stripQuotes(trimmed) : undefined;
  }

  private stripQuotes(value: string) {
    return value.replace(/^['"]|['"]$/g, "");
  }

  private buildConfluenceDocuments(/* not used here */) {
    return [];
  }

  private extractString(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value))
      return value
        .map((v) => this.extractString(v))
        .filter(Boolean)
        .join(" ");
    if (value && typeof value === "object") {
      if ("text" in (value as Record<string, unknown>)) {
        const text = (value as any).text;
        return typeof text === "string" ? text : this.extractString(text);
      }
      if (
        "content" in (value as Record<string, unknown>) &&
        Array.isArray((value as any).content)
      ) {
        return ((value as any).content ?? [])
          .map((c: unknown) => this.extractString(c))
          .filter(Boolean)
          .join(" ");
      }
    }
    return "";
  }

  private normalizeText(value: unknown): string {
    const raw = this.extractString(value || "");
    if (!raw) return "";
    return raw
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private extractBodyStorage(page: ConfluenceContent): unknown {
    if (!page || typeof page !== "object") return undefined;
    const body = (page as any).body;
    if (!body || typeof body !== "object") return undefined;
    const storage = (body as any).storage;
    if (!storage || typeof storage !== "object") return undefined;
    return (storage as any).value;
  }
}
