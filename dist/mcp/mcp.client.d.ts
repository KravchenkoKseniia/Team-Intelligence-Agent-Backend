import { McpClient } from './mcp.types';
export declare class LocalMcpClient implements McpClient {
    private readonly logger;
    invoke<TArgs extends object, TResp = unknown>(toolName: string, _args: TArgs): Promise<TResp>;
}
