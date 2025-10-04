export const MCP_CLIENT = 'MCP_CLIENT';
export const MCP_CONFIG = 'MCP_CONFIG';

export interface McpClient {
  invoke<TArgs extends object, TResp = unknown>(
    toolName: string,
    args: TArgs,
  ): Promise<TResp>;
}

export interface McpClientConfig {
  /**
   * Base URL of the MCP gateway endpoint. If {@link invokePathTemplate} is provided,
   * this should be the origin (e.g. https://mcp-gateway.local/api/).
   */
  baseUrl: string;
  /** Optional API key/token that will be sent with every MCP request. */
  apiKey?: string;
  /**
   * Header name for sending the API key. Defaults to the Authorization header with Bearer prefix.
   */
  apiKeyHeader?: string;
  /** Request timeout in milliseconds for the underlying HTTP call. */
  timeoutMs?: number;
  /**
   * Optional path template appended to {@link baseUrl}. If provided, `{toolName}` placeholder will
   * be replaced with the encoded tool name. When omitted, the client posts directly to {@link baseUrl}.
   */
  invokePathTemplate?: string;
}
