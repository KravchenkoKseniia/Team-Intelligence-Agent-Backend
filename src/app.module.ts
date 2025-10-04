import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { McpModule } from './mcp/mcp.module';
import { JiraModule } from './jira/jira.module';

@Module({
  imports: [McpModule, JiraModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
