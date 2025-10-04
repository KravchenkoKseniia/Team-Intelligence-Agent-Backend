import { Module } from '@nestjs/common';
import { JiraController } from './jira.controller';
import { JiraService } from './jira.service';
import { McpModule } from '../mcp/mcp.module';
import { JiraApiController } from './jira-api.controller';
import { JiraApiService } from './jira-api.service';
import { ConfluenceApiController } from './confluence-api.controller';
import { ConfluenceApiService } from './confluence-api.service';

@Module({
  imports: [McpModule],
  controllers: [JiraController, JiraApiController, ConfluenceApiController],
  providers: [JiraService, JiraApiService, ConfluenceApiService],
})
export class JiraModule {}
