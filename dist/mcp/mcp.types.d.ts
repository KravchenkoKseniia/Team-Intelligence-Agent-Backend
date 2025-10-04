export declare const MCP_CLIENT = "MCP_CLIENT";
export interface McpClient {
    invoke<TArgs extends object, TResp = unknown>(toolName: string, args: TArgs): Promise<TResp>;
}
