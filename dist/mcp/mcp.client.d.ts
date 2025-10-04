import { type McpClient, type McpClientConfig } from './mcp.types';
export declare class HttpMcpClient implements McpClient {
    private readonly logger;
    private readonly baseUrl;
    private readonly apiKey?;
    private readonly apiKeyHeader?;
    private readonly timeoutMs;
    private readonly invokePathTemplate?;
    constructor(config: McpClientConfig);
    invoke<TArgs extends object, TResp = unknown>(toolName: string, args: TArgs): Promise<TResp>;
    private buildRequest;
    private buildHeaders;
    private createUrl;
    private parseResponse;
    private extractResult;
    private errorMessage;
    private isAbortError;
}
