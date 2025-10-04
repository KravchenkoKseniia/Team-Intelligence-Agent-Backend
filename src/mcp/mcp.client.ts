import { Injectable, Logger } from '@nestjs/common';
import { McpClient } from './mcp.types';

@Injectable()
export class LocalMcpClient implements McpClient {
  private readonly logger = new Logger(LocalMcpClient.name);

  async invoke<TArgs extends object, TResp = unknown>(
    toolName: string,
    _args: TArgs,
  ): Promise<TResp> {
    this.logger.warn(`LocalMcpClient invoked without implementation for tool "${toolName}"`);
    throw new Error('Local MCP client is not implemented. Provide a concrete MCP integration.');
  }
}
