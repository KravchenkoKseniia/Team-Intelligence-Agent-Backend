import {
  BadGatewayException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { McpClient, MCP_CLIENT } from '../mcp/mcp.types';
import { DEFAULT_JQL, DEFAULT_LIMIT, PreviewJiraDto } from './dto/preview-jira.dto';

export const JIRA_SEARCH_TOOL = 'jira.search';
const LOG_PREFIX = '[MCP:Jira]';
const MAX_LOG_LENGTH = 1_000_000;
const MCP_TIMEOUT_MS = 25_000;

class McpTimeoutError extends Error {
  constructor() {
    super('MCP request timed out');
  }
}

type JiraSearchArgs = {
  jiraUrl: string;
  apiKey: string;
  jql: string;
  limit: number;
};

type JiraSearchResp = {
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
};

export type JiraPreviewItem = {
  id: string;
  key: string;
  summary: string;
  status?: string;
};

export type JiraPreviewResponse = {
  ok: true;
  source: 'mcp:jira';
  count: number;
  items: JiraPreviewItem[];
};

@Injectable()
export class JiraService {
  constructor(@Inject(MCP_CLIENT) private readonly mcpClient: McpClient) {}

  async preview(dto: PreviewJiraDto): Promise<JiraPreviewResponse> {
    const jql = dto.jql?.trim() || DEFAULT_JQL;
    const limit = dto.limit ?? DEFAULT_LIMIT;

    const args: JiraSearchArgs = {
      jiraUrl: dto.jiraUrl,
      apiKey: dto.apiKey,
      jql,
      limit,
    };

    const response = await this.invokeWithTimeout<JiraSearchArgs, JiraSearchResp>(
      JIRA_SEARCH_TOOL,
      args,
    ).catch((error) => this.handleMcpError(error));

    this.logRawResponse(response);

    const issues = Array.isArray(response?.issues)
      ? response.issues.slice(0, limit)
      : [];

    const items = issues.map((issue) => ({
      id: issue.id,
      key: issue.key,
      summary: issue.fields?.summary ?? '',
      status: issue.fields?.status?.name ?? '',
    }));

    return {
      ok: true,
      source: 'mcp:jira',
      count: items.length,
      items,
    };
  }

  private async invokeWithTimeout<TArgs extends object, TResp>(
    toolName: string,
    args: TArgs,
  ): Promise<TResp> {
    return new Promise<TResp>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new McpTimeoutError());
      }, MCP_TIMEOUT_MS);

      this.mcpClient
        .invoke<TArgs, TResp>(toolName, args)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private handleMcpError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (error instanceof McpTimeoutError) {
      throw new BadGatewayException('MCP request timed out');
    }

    const status = this.extractStatus(error);

    if (status === HttpStatus.UNAUTHORIZED) {
      throw new UnauthorizedException('Invalid Jira credentials');
    }

    if (status === HttpStatus.FORBIDDEN) {
      throw new ForbiddenException('Access to Jira resource is forbidden');
    }

    throw new BadGatewayException('Failed to reach MCP Jira integration');
  }

  private extractStatus(error: unknown): number | undefined {
    if (typeof error === 'object' && error !== null) {
      const maybeStatus =
        (error as { status?: number }).status ??
        (error as { statusCode?: number }).statusCode;

      if (typeof maybeStatus === 'number') {
        return maybeStatus;
      }
    }

    return undefined;
  }

  private logRawResponse(response: JiraSearchResp): void {
    try {
      const serialized = JSON.stringify(response ?? null) ?? 'null';
      const truncated =
        serialized.length > MAX_LOG_LENGTH
          ? `${serialized.slice(0, MAX_LOG_LENGTH)}…`
          : serialized;
      console.log(`${LOG_PREFIX} Raw response:`, truncated);
    } catch (serializationError) {
      console.warn(`${LOG_PREFIX} Failed to serialize MCP response`, serializationError);
    }
  }
}
