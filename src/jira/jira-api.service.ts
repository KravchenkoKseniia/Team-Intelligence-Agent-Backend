import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { ExportJiraIssuesDto } from './dto/export-jira-issues.dto';
import { VectorService, VectorDocument } from '../vector/vector.service';
import { loadEnv } from '../utils/env-loader';

const LOG_PREFIX = '[JiraAPI]';
const PROJECT_SEARCH_PATH = '/rest/api/3/project/search';
const SEARCH_PATH = '/rest/api/3/search/jql';
const EXPORT_DIRECTORY = 'tmp';
const EXPORT_FILENAME_PREFIX = 'jira-issues';

interface JiraCredentials {
  jiraUrl: string;
  email: string;
  apiKey: string;
}

interface JiraProject {
  id?: string;
  key?: string;
  name?: string;
}

interface JiraIssue {
  id?: string;
  key?: string;
  fields?: Record<string, unknown>;
}

interface JiraExportProject {
  project: JiraProject;
  issues: JiraIssue[];
}

type ExportSummary = {
  file: string;
  projectCount: number;
  issueCount: number;
  vectorization?: {
    namespace: string;
    vectorCount: number;
  };
};

@Injectable()
export class JiraApiService {
  constructor(private readonly vectorService: VectorService) {}

  async exportAllIssues(options: ExportJiraIssuesDto = new ExportJiraIssuesDto()): Promise<ExportSummary> {
    const credentials = this.resolveCredentials(options);
    console.log(
      `${LOG_PREFIX} ✅ Using credentials -> URL: ${credentials.jiraUrl}, EMAIL: ${credentials.email}`,
    );

    const projects = await this.fetchAllProjects(credentials, options.projectBatchSize);
    console.log(`${LOG_PREFIX} 🔎 Found ${projects.length} project(s)`);

    const exported: JiraExportProject[] = [];
    let remaining = options.limit;
    let totalIssues = 0;

    for (const project of projects) {
      if (!project?.key) {
        continue;
      }
      if (remaining <= 0) {
        break;
      }

      const { issues, consumed } = await this.fetchAllIssuesForProject(
        credentials,
        project.key,
        remaining,
        options.issueBatchSize,
      );

      exported.push({ project, issues });
      remaining -= consumed;
      totalIssues += issues.length;

      console.log(`${LOG_PREFIX} 📌 ${project.key}: collected ${issues.length} issue(s)`);

      if (remaining <= 0) {
        break;
      }
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      projectCount: exported.length,
      issueCount: totalIssues,
      projects: exported,
    };

    const exportDir = join(process.cwd(), EXPORT_DIRECTORY);
    await mkdir(exportDir, { recursive: true });
    const filePath = join(exportDir, `${EXPORT_FILENAME_PREFIX}-${Date.now()}.json`);
    await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');

    console.log(
      `${LOG_PREFIX} ✅ Export complete -> ${payload.issueCount} issue(s) from ${payload.projectCount} project(s) saved to ${filePath}`,
    );

    let vectorization: ExportSummary['vectorization'];

    if (options.vectorize && totalIssues > 0) {
      const documents = this.buildIssueDocuments(exported);
      vectorization = await this.vectorService.embedAndUpsert(documents, {
        namespace: options.pineconeNamespace ?? 'test',
      });
    }

    return {
      file: filePath,
      projectCount: payload.projectCount,
      issueCount: payload.issueCount,
      vectorization,
    };
  }

  private async fetchAllProjects(
    credentials: JiraCredentials,
    batchSize: number,
  ): Promise<JiraProject[]> {
    const projects: JiraProject[] = [];
    let startAt = 0;
    const pageSize = Math.max(1, Math.min(batchSize, 1000));

    while (true) {
      const url = new URL(`${credentials.jiraUrl.replace(/\/$/, '')}${PROJECT_SEARCH_PATH}`);
      url.searchParams.set('startAt', String(startAt));
      url.searchParams.set('maxResults', String(pageSize));

      console.log(`${LOG_PREFIX} 🌍 Fetching projects from ${url.toString()}`);
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(credentials),
      }).catch((error) => {
        throw new BadGatewayException(`Failed to reach Jira project API: ${error}`);
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = await response.json();
      const pageProjects = Array.isArray(data.values) ? data.values : [];
      if (!pageProjects.length) {
        break;
      }

      projects.push(...pageProjects);
      startAt += pageProjects.length;

      const isLast = data.isLast === true || startAt >= (data.total ?? startAt);
      if (isLast) {
        break;
      }
    }

    return projects;
  }

  private async fetchAllIssuesForProject(
    credentials: JiraCredentials,
    projectKey: string,
    remainingLimit: number,
    batchSize: number,
  ): Promise<{ issues: JiraIssue[]; consumed: number }> {
    const issues: JiraIssue[] = [];
    let nextPageToken: string | undefined;
    let consumed = 0;

    const url = `${credentials.jiraUrl.replace(/\/$/, '')}${SEARCH_PATH}`;

    while (remainingLimit > 0) {
      const maxResults = Math.max(1, Math.min(batchSize, remainingLimit));
      const body: Record<string, unknown> = {
        jql: `project = "${projectKey}" ORDER BY updated DESC`,
        maxResults,
        fields: ['id', 'key', 'summary', 'status', 'description', 'created', 'updated'],
      };

      if (nextPageToken) {
        body.nextPageToken = nextPageToken;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(credentials),
        body: JSON.stringify(body),
      }).catch((error) => {
        throw new BadGatewayException(`Failed to reach Jira search API: ${error}`);
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = await response.json();
      const pageIssues = Array.isArray(data.issues) ? data.issues : [];
      if (!pageIssues.length) {
        break;
      }

      const consumedNow = Math.min(pageIssues.length, remainingLimit);
      issues.push(...pageIssues.slice(0, consumedNow));
      consumed += consumedNow;
      remainingLimit -= consumedNow;

      if (remainingLimit <= 0) {
        break;
      }

      if (typeof data.nextPageToken === 'string' && data.nextPageToken.length > 0) {
        nextPageToken = data.nextPageToken;
      } else {
        break;
      }
    }

    return { issues, consumed };
  }

  private buildIssueDocuments(exported: JiraExportProject[]): VectorDocument[] {
    const documents: VectorDocument[] = [];

    for (const entry of exported) {
      const projectKey = entry.project.key ?? entry.project.id ?? 'unknown';
      const projectName = entry.project.name ?? '';

      for (const issue of entry.issues) {
        const issueId = issue.id ?? issue.key ?? randomUUID();
        const fields = (issue.fields ?? {}) as Record<string, unknown>;
        const summary = this.extractString(fields['summary']);
        const status = this.extractStatus(fields['status']);
        const description = this.normalizeText(fields['description']);
        const updated = this.extractString(fields['updated']);
        const created = this.extractString(fields['created']);

        const textParts = [
          `Project: ${projectName || projectKey}`,
          issue.key ? `Issue: ${issue.key}` : '',
          summary ? `Summary: ${summary}` : '',
          status ? `Status: ${status}` : '',
          description ? `Description: ${description}` : '',
        ].filter(Boolean);

        if (created) {
          textParts.push(`Created: ${created}`);
        }
        if (updated) {
          textParts.push(`Updated: ${updated}`);
        }

        documents.push({
          id: issueId,
          text: textParts.join('\n'),
          metadata: {
            source: 'jira',
            projectKey,
            projectName,
            issueId,
            issueKey: issue.key ?? '',
            status,
          },
        });
      }
    }

    return documents;
  }

  private extractString(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.extractString(item)).filter(Boolean).join(' ');
    }
    if (value && typeof value === 'object') {
      if ('text' in (value as Record<string, unknown>)) {
        return this.extractString((value as { text?: unknown }).text);
      }
      if ('content' in (value as Record<string, unknown>) && Array.isArray((value as { content?: unknown }).content)) {
        return ((value as { content?: unknown[] }).content ?? [])
          .map((item) => this.extractString(item))
          .filter(Boolean)
          .join(' ');
      }
      if ('name' in (value as Record<string, unknown>)) {
        return this.extractString((value as { name?: unknown }).name);
      }
    }
    return '';
  }

  private normalizeText(value: unknown): string {
    const raw = this.extractString(value);
    if (!raw) {
      return '';
    }
    return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private extractStatus(value: unknown): string {
    if (value && typeof value === 'object' && 'name' in (value as Record<string, unknown>)) {
      return this.extractString((value as { name?: unknown }).name);
    }
    return this.extractString(value);
  }

  private resolveCredentials(options: ExportJiraIssuesDto): JiraCredentials {
    loadEnv();

    const jiraUrl = this.normalizeEnv(options.jiraUrl ?? process.env.JIRA_URL);
    const email = this.normalizeEnv(options.email ?? process.env.JIRA_EMAIL);
    const apiKey =
      this.normalizeEnv(options.apiKey ?? process.env.JIRA_API_KEY) ??
      this.normalizeEnv(process.env.JIRA_API_TOKEN);

    console.log(
      `${LOG_PREFIX} ENV check -> JIRA_URL=${Boolean(jiraUrl)}, JIRA_EMAIL=${Boolean(
        email,
      )}, JIRA_API_KEY=${apiKey ? '***set***' : 'undefined'}`,
    );

    if (!jiraUrl || !email || !apiKey) {
      throw new BadGatewayException('Jira credentials missing');
    }

    return { jiraUrl, email, apiKey };
  }

  private buildHeaders({ email, apiKey }: JiraCredentials): Record<string, string> {
    return {
      Authorization: `Basic ${Buffer.from(`${email}:${apiKey}`).toString('base64')}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let payload: any = null;
    try {
      payload = await response.json();
    } catch (_) {
      // ignore
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
      if (
        'errorMessages' in payload &&
        Array.isArray((payload as { errorMessages?: unknown }).errorMessages)
      ) {
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

  private normalizeEnv(value?: string | null): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.replace(/^['"]|['"]$/g, '') : undefined;
  }
}
