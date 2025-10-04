export declare const MCP_CLIENT = "MCP_CLIENT";
export declare const MCP_CONFIG = "MCP_CONFIG";
export interface McpClient {
    invoke<TArgs extends object, TResp = unknown>(toolName: string, args: TArgs): Promise<TResp>;
}
export interface McpClientConfig {
    baseUrl: string;
    apiKey?: string;
    apiKeyHeader?: string;
    timeoutMs?: number;
    invokePathTemplate?: string;
}
