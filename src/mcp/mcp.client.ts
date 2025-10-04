import { Inject, Injectable, Logger } from '@nestjs/common';
import { MCP_CONFIG, type McpClient, type McpClientConfig } from './mcp.types';

class McpHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly response?: unknown,
  ) {
    super(message);
    this.name = 'McpHttpError';
  }
}

@Injectable()
export class HttpMcpClient implements McpClient {
  private readonly logger = new Logger(HttpMcpClient.name);
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly apiKeyHeader?: string;
  private readonly timeoutMs: number;
  private readonly invokePathTemplate?: string;

  constructor(@Inject(MCP_CONFIG) config: McpClientConfig) {
    this.baseUrl = (config.baseUrl ?? '').trim().replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.apiKeyHeader = config.apiKeyHeader?.trim();
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.invokePathTemplate = config.invokePathTemplate?.trim();

    if (!this.baseUrl) {
      this.logger.warn('MCP base URL is not configured. MCP calls will fail until it is set.');
    }
  }

  async invoke<TArgs extends object, TResp = unknown>(
    toolName: string,
    args: TArgs,
  ): Promise<TResp> {
    if (!toolName) {
      throw new Error('toolName is required for MCP invocation');
    }

    if (!this.baseUrl) {
      const error = new Error('MCP base URL is not configured');
      (error as Error & { status?: number }).status = 500;
      throw error;
    }

    const { url, body } = this.buildRequest(toolName, args);
    const headers = this.buildHeaders(toolName);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const payload = await this.parseResponse(response);

      if (!response.ok) {
        throw new McpHttpError(
          this.errorMessage(response.status, payload),
          response.status,
          payload,
        );
      }

      return (this.extractResult(payload) ?? undefined) as TResp;
    } catch (error) {
      if (this.isAbortError(error)) {
        throw new McpHttpError(
          `MCP request aborted after ${this.timeoutMs}ms`,
          504,
        );
      }

      if (error instanceof McpHttpError) {
        throw error;
      }

      this.logger.error(`Unexpected MCP error for tool "${toolName}": ${error}`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildRequest<TArgs extends object>(toolName: string, args: TArgs) {
    if (this.invokePathTemplate) {
      const path = this.invokePathTemplate.replace(
        '{toolName}',
        encodeURIComponent(toolName),
      );
      const url = this.createUrl(path);
      return { url, body: args };
    }

    return {
      url: this.baseUrl,
      body: {
        tool: toolName,
        arguments: args,
      },
    };
  }

  private buildHeaders(toolName: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-MCP-Tool': toolName,
    };

    if (this.apiKey) {
      if (this.apiKeyHeader && this.apiKeyHeader.toLowerCase() !== 'authorization') {
        headers[this.apiKeyHeader] = this.apiKey;
      } else {
        headers.Authorization = /^Bearer\s/i.test(this.apiKey)
          ? this.apiKey
          : `Bearer ${this.apiKey}`;
      }
    }

    return headers;
  }

  private createUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    return new URL(normalizedPath, `${base}`).toString();
  }

  private async parseResponse(response: Response): Promise<unknown> {
    const text = await response.text();

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      throw new McpHttpError(
        'Failed to parse MCP response as JSON',
        response.status || 500,
        text,
      );
    }
  }

  private extractResult(payload: unknown): unknown {
    if (payload && typeof payload === 'object') {
      const maybeRecord = payload as Record<string, unknown>;

      if ('result' in maybeRecord) {
        return maybeRecord.result;
      }

      if ('data' in maybeRecord) {
        return maybeRecord.data;
      }
    }

    return payload;
  }

  private errorMessage(status: number, payload: unknown): string {
    if (payload && typeof payload === 'object') {
      const message = (payload as { message?: string }).message;
      if (message) {
        return message;
      }
    }

    return `MCP gateway responded with status ${status}`;
  }

  private isAbortError(error: unknown): boolean {
    return (
      !!error &&
      typeof error === 'object' &&
      'name' in error &&
      (error as { name: string }).name === 'AbortError'
    );
  }
}
