import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { PreviewJiraDirectDto } from './dto/preview-jira-direct.dto';
import { ListJiraProjectsDto } from './dto/list-jira-projects.dto';
import {
  ExportJiraIssuesDto,
  DEFAULT_ISSUE_BATCH_SIZE,
  DEFAULT_PROJECT_BATCH_SIZE,
  ISSUE_EXPORT_LIMIT,
} from './dto/export-jira-issues.dto';
import { JiraPreviewItem } from './jira.service';

const LOG_PREFIX = '[JiraAPI]';
const PROJECTS_LOG_PREFIX = '[JiraAPI:Projects]';
const EXPORT_LOG_PREFIX = '[JiraAPI:Export]';
const SEARCH_PATH = '/rest/api/3/search/jql';
const PROJECT_SEARCH_PATH = '/rest/api/3/project/search';
const MAX_LOG_LENGTH = 1_000_000;
const EXPORT_FILENAME_PREFIX = 'jira-issues';
const EXPORT_DIRECTORY = 'tmp';
const EXPORT_ISSUE_FIELDS = [
  'id',
  'key',
  'summary',
  'status',
  'assignee',
  'creator',
  'reporter',
  'priority',
  'issuetype',
  'created',
  'updated',
  'description',
];
const ENV_FILE_NAME = '.env';

let envLoaded = false;

interface JiraSearchResponse {
  issues?: JiraIssue[];
  total?: number;
  startAt?: number;
  maxResults?: number;
}

interface JiraProjectSearchResponse {
  values?: JiraProject[];
  total?: number;
  isLast?: boolean;
  maxResults?: number;
  startAt?: number;
}

type JiraProject = Record<string, unknown> & {
  id?: string;
  key?: string;
  name?: string;
};

type JiraCredentials = {
  jiraUrl: string;
  email: string;
  apiKey: string;
};

interface JiraIssueSearchParams {
  credentials: JiraCredentials;
  jql: string;
  startAt: number;
  maxResults: number;
  fields: string[];
  logPrefix?: string;
}

type JiraIssue = Record<string, unknown> & {
  id?: string;
  key?: string;
  fields?: Record<string, unknown> | null;
};

type JiraIssuesExportProject = {
  project: JiraProject;
  issues: JiraIssue[];
};

export type JiraIssuesExportResult = {
  ok: true;
  source: 'jira:api';
  issueCount: number;
  projectCount: number;
  limit: number;
  truncated: boolean;
  file: string;
};

export type JiraProjectListResponse = {
  ok: true;
  source: 'jira:api';
  count: number;
  total: number;
  startAt: number;
  limit: number;
  isLast: boolean;
  projects: JiraProject[];
};

@Injectable()
export class JiraApiService {
  async preview(dto: PreviewJiraDirectDto): Promise<{ count: number; items: JiraPreviewItem[] }> {
    const credentials = this.resolveCredentials({
      jiraUrl: dto.jiraUrl,
      email: dto.email,
      apiKey: dto.apiKey,
    });

    const data = await this.executeIssueSearch({
      credentials,
      jql: dto.jql,
      startAt: 0,
      maxResults: dto.limit,
      fields: ['id', 'key', 'summary', 'status'],
      logPrefix: LOG_PREFIX,
    });

    const issues = Array.isArray(data.issues) ? data.issues.slice(0, dto.limit) : [];
    const items: JiraPreviewItem[] = issues.map((issue) => {
      const fields = issue.fields && typeof issue.fields === 'object' ? issue.fields : undefined;
      const summary =
        fields && 'summary' in fields && typeof (fields as { summary?: unknown }).summary === 'string'
          ? ((fields as { summary?: string }).summary ?? '')
          : '';
      const statusValue =
        fields && 'status' in fields && typeof (fields as { status?: unknown }).status === 'object'
          ? ((fields as { status?: { name?: string | null } | null }).status ?? null)
          : null;
      const statusName =
        statusValue && typeof statusValue === 'object' && 'name' in statusValue
          ? (statusValue as { name?: string | null }).name ?? ''
          : '';

      return {
        id: issue.id ?? '',
        key: issue.key ?? '',
        summary,
        status: statusName,
      };
    });

    return {
      count: items.length,
      items,
    };
  }

  async listProjects(dto: ListJiraProjectsDto): Promise<JiraProjectListResponse> {
    const credentials = this.resolveCredentials({
      jiraUrl: dto.jiraUrl,
      email: dto.email,
      apiKey: dto.apiKey,
    });

    const startAt = dto.startAt ?? 0;
    const limit = dto.limit ?? 50;
    const url = this.buildProjectSearchUrl(credentials.jiraUrl, startAt, limit);
    const headers = this.buildAuthHeaders(credentials.email, credentials.apiKey);

    const response = await fetch(url, {
      method: 'GET',
      headers,
    }).catch((error) => {
      throw new BadGatewayException(`Failed to reach Jira API: ${error}`);
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = (await response.json().catch((error) => {
      throw new BadGatewayException(`Failed to parse Jira response: ${error}`);
    })) as JiraProjectSearchResponse;

    this.logRawResponse(data, PROJECTS_LOG_PREFIX);

    const projects = Array.isArray(data.values) ? data.values : [];
    const total = typeof data.total === 'number' ? data.total : projects.length;
    const resolvedLimit =
      dto.limit ?? (typeof data.maxResults === 'number' ? data.maxResults : projects.length);
    const resolvedStartAt = dto.startAt ?? (typeof data.startAt === 'number' ? data.startAt : 0);
    const isLast =
      typeof data.isLast === 'boolean'
        ? data.isLast
        : resolvedStartAt + projects.length >= total;

    return {
      ok: true,
      source: 'jira:api',
      count: projects.length,
      total,
      startAt: resolvedStartAt,
      limit: resolvedLimit,
      isLast,
      projects,
    };
  }

  async exportProjectIssues(dto: ExportJiraIssuesDto): Promise<JiraIssuesExportResult> {
    const limit = Math.min(dto.limit ?? ISSUE_EXPORT_LIMIT, ISSUE_EXPORT_LIMIT);
    const issueBatchSize = Math.max(1, Math.min(dto.issueBatchSize ?? DEFAULT_ISSUE_BATCH_SIZE, limit));
    const projectBatchSize = Math.max(1, dto.projectBatchSize ?? DEFAULT_PROJECT_BATCH_SIZE);

    const credentials = this.resolveCredentials({
      jiraUrl: dto.jiraUrl,
      email: dto.email,
      apiKey: dto.apiKey,
    });

    const projects = await this.fetchAllProjects(credentials, projectBatchSize);
    const exported: JiraIssuesExportProject[] = [];
    let totalIssues = 0;
    let truncated = false;

    for (let index = 0; index < projects.length; index += 1) {
      const project = projects[index];
      if (!project?.key) {
        continue;
      }

      if (totalIssues >= limit) {
        break;
      }

      const remainingForLimit = limit - totalIssues;
      if (remainingForLimit <= 0) {
        break;
      }

      const { issues, complete } = await this.fetchIssuesForProject(
        credentials,
        project.key,
        issueBatchSize,
        remainingForLimit,
      );

      exported.push({ project, issues });
      totalIssues += issues.length;

      if (!complete) {
        truncated = true;
      }

      if (totalIssues >= limit) {
        if (index < projects.length - 1) {
          truncated = true;
        }
        break;
      }
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      limit,
      issueCount: totalIssues,
      projectCount: exported.length,
      truncated,
      projects: exported,
    };

    const exportDir = join(process.cwd(), EXPORT_DIRECTORY);
    await mkdir(exportDir, { recursive: true });
    const filePath = join(exportDir, `${EXPORT_FILENAME_PREFIX}-${Date.now()}.json`);
    await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
    console.log(
      `${EXPORT_LOG_PREFIX} Exported ${totalIssues} issue(s) across ${exported.length} project(s) to ${filePath}`,
    );

    return {
      ok: true,
      source: 'jira:api',
      issueCount: totalIssues,
      projectCount: exported.length,
      limit,
      truncated,
      file: filePath,
    };
  }

  private async fetchAllProjects(
    credentials: JiraCredentials,
    batchSize: number,
  ): Promise<JiraProject[]> {
    const projects: JiraProject[] = [];
    let startAt = 0;

    while (true) {
      const pageDto = new ListJiraProjectsDto();
      pageDto.jiraUrl = credentials.jiraUrl;
      pageDto.email = credentials.email;
      pageDto.apiKey = credentials.apiKey;
      pageDto.startAt = startAt;
      pageDto.limit = batchSize;

      const page = await this.listProjects(pageDto);
      if (!page.projects.length) {
        break;
      }

      projects.push(...page.projects);

      if (page.isLast || projects.length >= page.total) {
        break;
      }

      startAt = page.startAt + page.projects.length;
    }

    return projects;
  }

  private async fetchIssuesForProject(
    credentials: JiraCredentials,
    projectKey: string,
    issueBatchSize: number,
    remainingLimit: number,
  ): Promise<{ issues: JiraIssue[]; complete: boolean }> {
    const issues: JiraIssue[] = [];
    let remaining = remainingLimit;
    let startAt = 0;
    let complete = true;
    const escapedProjectKey = this.escapeJqlValue(projectKey);
    const logPrefix = `[JiraAPI:Issues:${projectKey}]`;

    while (remaining > 0) {
      const batchSize = Math.min(issueBatchSize, remaining);
      const jql = `project = "${escapedProjectKey}" ORDER BY updated DESC`;

      const response = await this.executeIssueSearch({
        credentials,
        jql,
        startAt,
        maxResults: batchSize,
        fields: EXPORT_ISSUE_FIELDS,
        logPrefix,
      });

      const pageIssues = Array.isArray(response.issues) ? response.issues : [];
      if (!pageIssues.length) {
        break;
      }

      const toAppend = pageIssues.slice(0, remaining);
      issues.push(...toAppend);
      remaining -= toAppend.length;

      const total = typeof response.total === 'number' ? response.total : undefined;
      const responseStartAt = typeof response.startAt === 'number' ? response.startAt : startAt;
      const nextStartAt = responseStartAt + pageIssues.length;

      if (remaining <= 0) {
        if (total !== undefined && nextStartAt < total) {
          complete = false;
        }
        break;
      }

      if (total !== undefined && nextStartAt >= total) {
        break;
      }

      if (pageIssues.length < batchSize) {
        break;
      }

      startAt = nextStartAt;
    }

    return { issues, complete };
  }

  private async executeIssueSearch(params: JiraIssueSearchParams): Promise<JiraSearchResponse> {
    const { credentials, jql, startAt, maxResults, fields, logPrefix } = params;
    const url = this.buildIssueSearchUrl(credentials.jiraUrl);
    const headers: Record<string, string> = {
      ...this.buildAuthHeaders(credentials.email, credentials.apiKey),
      'Content-Type': 'application/json',
    };

    const body: Record<string, unknown> = {
      queries: [
        {
          jql,
          query: jql,
          startAt,
          maxResults,
          fields,
        },
      ],
    };

    if (fields.length) {
      body.fields = fields;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }).catch((error) => {
      throw new BadGatewayException(`Failed to reach Jira API: ${error}`);
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const raw = (await response.json().catch((error) => {
      throw new BadGatewayException(`Failed to parse Jira response: ${error}`);
    })) as JiraSearchResponse;

    this.logRawResponse(raw, logPrefix ?? LOG_PREFIX);

    return this.normalizeSearchResponse(raw);
  }

  private resolveCredentials(overrides: Partial<JiraCredentials> = {}): JiraCredentials {
    this.ensureEnvLoaded();

    const jiraUrl = this.normalizeUrl(overrides.jiraUrl ?? process.env.JIRA_URL);
    const email = this.normalizeEmail(overrides.email ?? process.env.JIRA_EMAIL);
    const apiKey = this.normalizeApiKey(
      overrides.apiKey ?? process.env.JIRA_API_KEY ?? process.env.JIRA_API_TOKEN,
    );

    if (!jiraUrl) {
      throw new BadGatewayException('Jira URL is not configured');
    }

    if (!email) {
      throw new BadGatewayException('Jira email is not configured');
    }

    if (!apiKey) {
      throw new BadGatewayException('Jira API token is not configured');
    }

    return {
      jiraUrl,
      email,
      apiKey,
    };
  }

  private normalizeUrl(raw?: string): string | undefined {
    if (!raw) {
      return undefined;
    }

    const trimmed = raw.trim().replace(/^['"]|['"]$/g, '');
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private normalizeEmail(raw?: string): string | undefined {
    if (!raw) {
      return undefined;
    }

    const trimmed = raw.trim().replace(/^['"]|['"]$/g, '');
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private normalizeApiKey(raw?: string): string | undefined {
    if (!raw) {
      return undefined;
    }

    const trimmed = raw.trim().replace(/^['"]|['"]$/g, '');
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private ensureEnvLoaded(): void {
    if (envLoaded) {
      return;
    }

    envLoaded = true;

    try {
      const envPath = join(process.cwd(), ENV_FILE_NAME);
      if (!existsSync(envPath)) {
        return;
      }

      const contents = readFileSync(envPath, 'utf8');
      const lines = contents.split(/\r?\n/);
      for (const line of lines) {
        if (!line || !line.trim() || line.trim().startsWith('#')) {
          continue;
        }

        const separatorIndex = line.indexOf('=');
        if (separatorIndex < 0) {
          continue;
        }

        const key = line.slice(0, separatorIndex).trim();
        if (!key || process.env[key] !== undefined) {
          continue;
        }

        const value = line.slice(separatorIndex + 1).trim();
        const unquoted = value.replace(/^['"]|['"]$/g, '');
        process.env[key] = unquoted;
      }
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to load ${ENV_FILE_NAME} file`, error);
    }
  }

  private buildIssueSearchUrl(jiraUrl: string): string {
    const base = jiraUrl.endsWith('/') ? jiraUrl.slice(0, -1) : jiraUrl;
    return `${base}${SEARCH_PATH}`;
  }

  private buildProjectSearchUrl(jiraUrl: string, startAt: number, limit: number): string {
    const base = jiraUrl.endsWith('/') ? jiraUrl.slice(0, -1) : jiraUrl;
    const url = new URL(`${base}${PROJECT_SEARCH_PATH}`);
    url.searchParams.set('startAt', String(startAt));
    url.searchParams.set('maxResults', String(limit));
    return url.toString();
  }

  private buildAuthToken(email: string, apiKey: string): string {
    return Buffer.from(`${email}:${apiKey}`).toString('base64');
  }

  private buildAuthHeaders(email: string, apiKey: string): Record<string, string> {
    return {
      Authorization: `Basic ${this.buildAuthToken(email, apiKey)}`,
      Accept: 'application/json',
    };
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let payload: unknown = null;

    try {
      payload = await response.json();
    } catch (_) {
      // ignore parse errors for error payload
    }

    if (response.status === 401) {
      throw new UnauthorizedException('Invalid Jira credentials');
    }

    if (response.status === 403) {
      throw new ForbiddenException('Access to Jira resource is forbidden');
    }

    const message = this.extractErrorMessage(payload) ?? 'Failed to query Jira API';
    throw new BadGatewayException(`${message} (status ${response.status})`);
  }

  private extractErrorMessage(payload: unknown): string | undefined {
    if (payload && typeof payload === 'object') {
      if ('errorMessages' in payload && Array.isArray((payload as { errorMessages?: unknown }).errorMessages)) {
        const [first] = (payload as { errorMessages?: string[] }).errorMessages ?? [];
        if (first) {
          return first;
        }
      }

      const maybeMessage = (payload as { message?: string }).message;
      if (maybeMessage) {
        return maybeMessage;
      }
    }

    return undefined;
  }

  private logRawResponse(response: unknown, prefix: string): void {
    try {
      const serialized = JSON.stringify(response ?? null) ?? 'null';
      const truncated =
        serialized.length > MAX_LOG_LENGTH
          ? `${serialized.slice(0, MAX_LOG_LENGTH)}…`
          : serialized;
      console.log(`${prefix} Raw response:`, truncated);
    } catch (error) {
      console.warn(`${prefix} Failed to serialize Jira response`, error);
    }
  }

  private escapeJqlValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private normalizeSearchResponse(raw: unknown): JiraSearchResponse {
    const fallback: JiraSearchResponse = {
      issues: [],
      total: 0,
      startAt: 0,
      maxResults: 0,
    };

    if (!raw || typeof raw !== 'object') {
      return fallback;
    }

    const rawWithIssues = raw as { issues?: JiraIssue[] };
    if (Array.isArray(rawWithIssues.issues)) {
      return {
        issues: rawWithIssues.issues,
        total: typeof (raw as { total?: number }).total === 'number'
          ? (raw as { total?: number }).total
          : rawWithIssues.issues.length,
        startAt: typeof (raw as { startAt?: number }).startAt === 'number'
          ? (raw as { startAt?: number }).startAt
          : 0,
        maxResults: typeof (raw as { maxResults?: number }).maxResults === 'number'
          ? (raw as { maxResults?: number }).maxResults
          : rawWithIssues.issues.length,
      };
    }

    const rawWithQueries = raw as {
      queries?: Array<
        Record<string, unknown> & {
          issues?: JiraIssue[];
          results?: Array<unknown>;
          values?: JiraIssue[];
          total?: number;
          startAt?: number;
          maxResults?: number;
        }
      >;
    };

    if (Array.isArray(rawWithQueries.queries)) {
      for (const query of rawWithQueries.queries) {
        if (!query) {
          continue;
        }

        if (Array.isArray(query.issues) && query.issues.length) {
          return {
            issues: query.issues,
            total: typeof query.total === 'number' ? query.total : query.issues.length,
            startAt: typeof query.startAt === 'number' ? query.startAt : 0,
            maxResults: typeof query.maxResults === 'number' ? query.maxResults : query.issues.length,
          };
        }

        if (Array.isArray(query.values) && query.values.length) {
          return {
            issues: query.values,
            total: typeof query.total === 'number' ? query.total : query.values.length,
            startAt: typeof query.startAt === 'number' ? query.startAt : 0,
            maxResults: typeof query.maxResults === 'number' ? query.maxResults : query.values.length,
          };
        }

        if (Array.isArray(query.results) && query.results.length) {
          const issues = query.results
            .map((item) => {
              if (item && typeof item === 'object' && 'issue' in item) {
                return (item as { issue?: JiraIssue }).issue ?? null;
              }
              return item as JiraIssue;
            })
            .filter((issue): issue is JiraIssue => Boolean(issue));

          if (issues.length) {
            return {
              issues,
              total: typeof query.total === 'number' ? query.total : issues.length,
              startAt: typeof query.startAt === 'number' ? query.startAt : 0,
              maxResults: typeof query.maxResults === 'number' ? query.maxResults : issues.length,
            };
          }
        }
      }
    }

    return fallback;
  }
}
