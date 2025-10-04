import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

import { loadEnv } from "../utils/env-loader";

const LOG_PREFIX = "[ConfluenceAPI]";
const SPACES_PATH = "/wiki/rest/api/space";
const CONTENT_PATH = "/wiki/rest/api/content";
const EXPORT_DIRECTORY = "tmp";
const EXPORT_FILENAME_PREFIX = "confluence-spaces";

type ConfluenceSpace = {
  id?: string;
  key?: string;
  name?: string;
  _links?: Record<string, any>;
};
type ConfluenceContent = Record<string, any>;

@Injectable()
export class ConfluenceApiService {
  /**
   * Export all spaces + pages for each space into tmp/*.json
   * Reads CONFLUENCE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_KEY from .env
   */
  async exportAllSpacesContent(): Promise<string> {
    const credentials = this.resolveCredentials();
    console.log(
      `${LOG_PREFIX} ✅ Using credentials -> URL: ${credentials.confluenceUrl}, EMAIL: ${credentials.email}`
    );

    const spaces = await this.fetchAllSpaces(credentials);
    console.log(`${LOG_PREFIX} 🔎 Found ${spaces.length} spaces`);

    const payload: {
      exportedAt: string;
      spaceCount: number;
      pageCount: number;
      spaces: Array<{ space: ConfluenceSpace; pages: ConfluenceContent[] }>;
    } = {
      exportedAt: new Date().toISOString(),
      spaceCount: 0,
      pageCount: 0,
      spaces: [],
    };

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

      payload.spaces.push({ space, pages });
      payload.pageCount += pages.length;
    }

    payload.spaceCount = payload.spaces.length;

    // Save to file
    const exportDir = join(process.cwd(), EXPORT_DIRECTORY);
    await mkdir(exportDir, { recursive: true });
    const filePath = join(
      exportDir,
      `${EXPORT_FILENAME_PREFIX}-${Date.now()}.json`
    );
    await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");

    console.log(
      `${LOG_PREFIX} ✅ Export complete -> ${payload.pageCount} pages from ${payload.spaceCount} spaces saved to ${filePath}`
    );
    return filePath;
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

      if (!res.ok) {
        console.error(
          `${LOG_PREFIX} ❌ Failed to fetch spaces, status: ${res.status}`
        );
        await this.handleErrorResponse(res);
      }

      const data = await res.json();
      const results = Array.isArray((data as any).results)
        ? (data as any).results
        : [];
      if (!results.length) break;

      spaces.push(...results);
      start += results.length;

      // If page smaller than limit -> end
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

      if (!res.ok) {
        console.error(
          `${LOG_PREFIX} ❌ Failed to fetch content for space ${spaceKey}, status: ${res.status}`
        );
        await this.handleErrorResponse(res);
      }

      const data = await res.json();
      const results = Array.isArray((data as any).results)
        ? (data as any).results
        : [];
      if (!results.length) break;

      pages.push(...results);
      start += results.length;

      if (results.length < limit) break;
    }

    return pages;
  }

  private resolveCredentials() {
    loadEnv(); // ✅ загальний loader
    const confluenceUrl = this.normalizeEnv(process.env.CONFLUENCE_URL);
    const email = this.normalizeEnv(process.env.CONFLUENCE_EMAIL);
    const apiKey =
      this.normalizeEnv(process.env.CONFLUENCE_API_KEY) ??
      this.normalizeEnv(process.env.CONFLUENCE_API_TOKEN);

    console.log(
      `${LOG_PREFIX} ENV check -> CONFLUENCE_URL=${Boolean(
        confluenceUrl
      )}, CONFLUENCE_EMAIL=${Boolean(email)}, CONFLUENCE_API_KEY=${
        apiKey ? "***set***" : "undefined"
      }`
    );

    if (!confluenceUrl || !email || !apiKey) {
      console.error(`${LOG_PREFIX} ❌ Missing Confluence credentials`);
      throw new BadGatewayException("Confluence credentials missing");
    }

    return { confluenceUrl, email, apiKey };
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

  private normalizeEnv(value?: string | null): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed ? this.stripQuotes(trimmed) : undefined;
  }

  private stripQuotes(value: string): string {
    return value.replace(/^['"]|['"]$/g, "");
  }
}
