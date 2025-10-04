import { Module } from '@nestjs/common';
import { JiraController } from './jira.controller';
import { JiraService } from './jira.service';
import { McpModule } from '../mcp/mcp.module';

@Module({
  imports: [McpModule],
  controllers: [JiraController],
  providers: [JiraService],
})
export class JiraModule {}
