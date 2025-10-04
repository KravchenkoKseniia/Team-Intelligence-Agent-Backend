import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { existsSync, readFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const LOG_PREFIX = "[JiraAPI]";
const PROJECT_SEARCH_PATH = "/rest/api/3/project/search";
const SEARCH_PATH = "/rest/api/3/search/jql";
const EXPORT_DIRECTORY = "tmp";
const EXPORT_FILENAME_PREFIX = "jira-issues";
const ENV_FILE_NAME = ".env";

let envLoaded = false;

type JiraProject = { id: string; key: string; name: string };
type JiraIssue = { id: string; key: string; fields?: Record<string, any> };

@Injectable()
export class JiraApiService {
  async exportAllIssues(): Promise<string> {
    const credentials = this.resolveCredentials();

    console.log(
      `${LOG_PREFIX} ✅ Using credentials -> URL: ${credentials.jiraUrl}, EMAIL: ${credentials.email}`
    );

    // 1. Отримуємо всі проєкти
    const projects = await this.fetchAllProjects(credentials);
    console.log(`${LOG_PREFIX} 🔎 Found ${projects.length} projects`);

    const all: { project: JiraProject; issues: JiraIssue[] }[] = [];

    // 2. Для кожного проєкту тягнемо задачі
    for (const project of projects) {
      const issues = await this.fetchAllIssuesForProject(
        credentials,
        project.key
      );
      all.push({ project, issues });
      console.log(`${LOG_PREFIX} 📌 ${project.key}: ${issues.length} issues`);
    }

    // 3. Готуємо payload
    const payload = {
      exportedAt: new Date().toISOString(),
      projectCount: all.length,
      issueCount: all.reduce((sum, p) => sum + p.issues.length, 0),
      projects: all,
    };

    // 4. Зберігаємо у файл
    const exportDir = join(process.cwd(), EXPORT_DIRECTORY);
    await mkdir(exportDir, { recursive: true });
    const filePath = join(
      exportDir,
      `${EXPORT_FILENAME_PREFIX}-${Date.now()}.json`
    );
    await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");

    console.log(
      `${LOG_PREFIX} ✅ Export complete -> ${payload.issueCount} issues from ${payload.projectCount} projects saved to ${filePath}`
    );
    return filePath;
  }

  private async fetchAllProjects(credentials: {
    jiraUrl: string;
    email: string;
    apiKey: string;
  }): Promise<JiraProject[]> {
    const url = `${credentials.jiraUrl.replace(
      /\/$/,
      ""
    )}${PROJECT_SEARCH_PATH}`;
    console.log(`${LOG_PREFIX} 🌍 Fetching projects from ${url}`);
    const res = await fetch(url, { headers: this.buildHeaders(credentials) });
    if (!res.ok) {
      console.error(
        `${LOG_PREFIX} ❌ Failed to fetch projects, status: ${res.status}`
      );
      await this.handleErrorResponse(res);
    }
    const data = await res.json();
    return Array.isArray(data.values)
      ? data.values.map((p: any) => ({
          id: p.id,
          key: p.key,
          name: p.name,
        }))
      : [];
  }

  private async fetchAllIssuesForProject(
    credentials: { jiraUrl: string; email: string; apiKey: string },
    projectKey: string
  ): Promise<JiraIssue[]> {
    const issues: JiraIssue[] = [];
    let nextPageToken: string | undefined = undefined;
    const maxResults = 100; // можна зробити налаштовуваним

    console.log(
      `${LOG_PREFIX} 🔎 Fetching issues for project ${projectKey} (using nextPageToken pagination)`
    );

    const url = `${credentials.jiraUrl.replace(/\/$/, "")}${SEARCH_PATH}`;

    while (true) {
      const body: any = {
        jql: `project = "${projectKey}" ORDER BY updated DESC`,
        maxResults,
        fields: ["id", "key", "summary", "status", "created", "updated"],
      };

      if (nextPageToken) {
        body.nextPageToken = nextPageToken;
      }

      console.log(`${LOG_PREFIX} Request body: ${JSON.stringify(body)}`);

      const res = await fetch(url, {
        method: "POST",
        headers: this.buildHeaders(credentials),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        console.error(
          `${LOG_PREFIX} ❌ Failed to fetch issues for ${projectKey}, status: ${res.status}`
        );
        await this.handleErrorResponse(res);
      }

      const data = await res.json();

      // Безпечне читання масиву issues
      const pageIssues = Array.isArray(data.issues) ? data.issues : [];
      if (!pageIssues.length) {
        break;
      }

      issues.push(...pageIssues);

      // Якщо сервер повернув nextPageToken — беремо його і продовжуємо
      if (
        data.nextPageToken &&
        typeof data.nextPageToken === "string" &&
        data.nextPageToken.length
      ) {
        nextPageToken = data.nextPageToken;
        console.log(
          `${LOG_PREFIX} ▶ nextPageToken: ${nextPageToken} — fetching next page`
        );
        // ітерація продовжиться
      } else {
        // немає токена — кінець пагінації
        break;
      }
    }

    console.log(
      `${LOG_PREFIX} 📌 ${projectKey}: collected ${issues.length} issues`
    );
    return issues;
  }

  private resolveCredentials() {
    this.ensureEnvLoaded();
    const jiraUrl = process.env.JIRA_URL;
    const email = process.env.JIRA_EMAIL;
    const apiKey = process.env.JIRA_API_KEY;
    if (!jiraUrl || !email || !apiKey) {
      console.error(
        `${LOG_PREFIX} ❌ Missing credentials. URL=${jiraUrl}, EMAIL=${email}, APIKEY=${
          apiKey ? "***set***" : "undefined"
        }`
      );
      throw new BadGatewayException("Jira credentials missing in .env");
    }
    return { jiraUrl, email, apiKey };
  }

  private buildHeaders({ email, apiKey }: { email: string; apiKey: string }) {
    return {
      Authorization: `Basic ${Buffer.from(`${email}:${apiKey}`).toString(
        "base64"
      )}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  private async handleErrorResponse(res: Response): Promise<never> {
    let payload: any = null;
    try {
      payload = await res.json();
    } catch {}
    console.error(
      `${LOG_PREFIX} ❌ Jira API error:`,
      payload || res.statusText
    );
    if (res.status === 401)
      throw new UnauthorizedException("Invalid Jira credentials");
    if (res.status === 403) throw new ForbiddenException("Access forbidden");
    throw new BadGatewayException(
      payload?.message || `Jira error ${res.status}`
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
        const [key, ...rest] = line.split("=");
        if (!key) continue;
        process.env[key.trim()] = rest.join("=").trim();
      }
      console.log(`${LOG_PREFIX} ✅ Loaded env from ${ENV_FILE_NAME}`);
    } catch (e) {
      console.warn(`${LOG_PREFIX} ❌ Failed to load ${ENV_FILE_NAME}`, e);
    }
  }
}
