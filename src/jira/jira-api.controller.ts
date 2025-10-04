import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PreviewJiraDirectDto } from './dto/preview-jira-direct.dto';
import { ListJiraProjectsDto } from './dto/list-jira-projects.dto';
import { JiraApiService } from './jira-api.service';

@Controller('jira')
export class JiraApiController {
  constructor(private readonly jiraApiService: JiraApiService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  async preview(@Body() dto: PreviewJiraDirectDto) {
    const result = await this.jiraApiService.preview(dto);
    return {
      ok: true,
      source: 'jira:api',
      count: result.count,
      items: result.items,
    };
  }

  @Post('projects')
  @HttpCode(HttpStatus.OK)
  listProjects(@Body() dto: ListJiraProjectsDto) {
    return this.jiraApiService.listProjects(dto);
  }
}
