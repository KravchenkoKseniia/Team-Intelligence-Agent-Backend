import { McpClient } from '../mcp/mcp.types';
import { PreviewJiraDto } from './dto/preview-jira.dto';
export declare const JIRA_SEARCH_TOOL = "jira.search";
export type JiraPreviewItem = {
    id: string;
    key: string;
    summary: string;
};
export type JiraPreviewResponse = {
    ok: true;
    source: 'mcp:jira';
    count: number;
    items: JiraPreviewItem[];
};
export declare class JiraService {
    private readonly mcpClient;
    constructor(mcpClient: McpClient);
    preview(dto: PreviewJiraDto): Promise<JiraPreviewResponse>;
    private invokeWithTimeout;
    private handleMcpError;
    private extractStatus;
    private logRawResponse;
}
