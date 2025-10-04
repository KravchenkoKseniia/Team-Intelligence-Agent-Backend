import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PreviewJiraDirectDto } from './dto/preview-jira-direct.dto';
import { ListJiraProjectsDto } from './dto/list-jira-projects.dto';
import { JiraPreviewItem } from './jira.service';

const LOG_PREFIX = '[JiraAPI]';
const PROJECTS_LOG_PREFIX = '[JiraAPI:Projects]';
const SEARCH_PATH = '/rest/api/3/search/jql';
const PROJECT_SEARCH_PATH = '/rest/api/3/project/search';
const MAX_LOG_LENGTH = 1_000_000;

interface JiraSearchResponse {
  issues?: Array<{
    id: string;
    key: string;
    fields?: {
      summary?: string | null;
      status?: {
        name?: string | null;
      } | null;
    } | null;
  }>;
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
    const url = this.buildSearchUrl(dto.jiraUrl);
    const body = JSON.stringify({
      jql: dto.jql,
      maxResults: dto.limit,
      fields: ['id', 'key', 'summary', 'status'],
    });

    const headers: Record<string, string> = {
      ...this.buildAuthHeaders(dto.email, dto.apiKey),
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    }).catch((error) => {
      throw new BadGatewayException(`Failed to reach Jira API: ${error}`);
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = (await response.json().catch((error) => {
      throw new BadGatewayException(`Failed to parse Jira response: ${error}`);
    })) as JiraSearchResponse;

    this.logRawResponse(data, LOG_PREFIX);

    const issues = Array.isArray(data.issues) ? data.issues.slice(0, dto.limit) : [];
    const items: JiraPreviewItem[] = issues.map((issue) => ({
      id: issue.id,
      key: issue.key,
      summary: issue.fields?.summary ?? '',
      status: issue.fields?.status?.name ?? '',
    }));

    return {
      count: items.length,
      items,
    };
  }

  async listProjects(dto: ListJiraProjectsDto): Promise<JiraProjectListResponse> {
    const url = this.buildProjectSearchUrl(dto.jiraUrl, dto.startAt, dto.limit);
    const headers = this.buildAuthHeaders(dto.email, dto.apiKey);

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
    const limit =
      dto.limit ?? (typeof data.maxResults === 'number' ? data.maxResults : projects.length);
    const startAt = dto.startAt ?? (typeof data.startAt === 'number' ? data.startAt : 0);
    const isLast =
      typeof data.isLast === 'boolean'
        ? data.isLast
        : startAt + projects.length >= total;

    return {
      ok: true,
      source: 'jira:api',
      count: projects.length,
      total,
      startAt,
      limit,
      isLast,
      projects,
    };
  }

  private buildSearchUrl(jiraUrl: string): string {
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
}
