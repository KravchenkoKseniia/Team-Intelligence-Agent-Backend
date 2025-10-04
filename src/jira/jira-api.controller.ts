import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { JiraApiService } from './jira-api.service';
import { ExportJiraIssuesDto } from './dto/export-jira-issues.dto';

@Controller('jira')
export class JiraApiController {
  constructor(private readonly jiraApiService: JiraApiService) {}

  @Post('export')
  @HttpCode(HttpStatus.OK)
  async export(@Body() dto?: ExportJiraIssuesDto) {
    const options = dto ?? new ExportJiraIssuesDto();
    const result = await this.jiraApiService.exportAllIssues(options);

    return {
      ok: true,
      source: 'jira:api',
      file: result.file,
      projectCount: result.projectCount,
      issueCount: result.issueCount,
      vectorization: result.vectorization,
    };
  }
}
