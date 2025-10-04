import { Module } from '@nestjs/common';
import { LocalMcpClient } from './mcp.client';
import { MCP_CLIENT } from './mcp.types';

@Module({
  providers: [
    {
      provide: MCP_CLIENT,
      useClass: LocalMcpClient,
    },
  ],
  exports: [MCP_CLIENT],
})
export class McpModule {}
