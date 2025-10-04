import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { JiraService } from './jira.service';
import { PreviewJiraDto } from './dto/preview-jira.dto';

@Controller('mcp/jira')
export class JiraController {
  constructor(private readonly jiraService: JiraService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@Body() dto: PreviewJiraDto) {
    return this.jiraService.preview(dto);
  }
}
