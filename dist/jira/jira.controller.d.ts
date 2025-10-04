import { JiraService } from './jira.service';
import { PreviewJiraDto } from './dto/preview-jira.dto';
export declare class JiraController {
    private readonly jiraService;
    constructor(jiraService: JiraService);
    preview(dto: PreviewJiraDto): Promise<import("./jira.service").JiraPreviewResponse>;
}
