import { Module } from '@nestjs/common';
import { HttpMcpClient } from './mcp.client';
import { MCP_CLIENT, MCP_CONFIG, type McpClientConfig } from './mcp.types';

const mcpConfigProvider = {
  provide: MCP_CONFIG,
  useFactory: (): McpClientConfig => {
    const timeoutEnv = process.env.MCP_HTTP_TIMEOUT;
    const timeoutMs = timeoutEnv ? Number(timeoutEnv) : undefined;

    return {
      baseUrl: process.env.MCP_BASE_URL ?? '',
      apiKey: process.env.MCP_API_KEY,
      apiKeyHeader: process.env.MCP_API_KEY_HEADER,
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
      invokePathTemplate: process.env.MCP_INVOKE_PATH_TEMPLATE,
    };
  },
};

@Module({
  providers: [
    mcpConfigProvider,
    {
      provide: MCP_CLIENT,
      useClass: HttpMcpClient,
    },
  ],
  exports: [MCP_CLIENT],
})
export class McpModule {}
