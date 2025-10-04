import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { McpModule } from "./mcp/mcp.module";
import { JiraModule } from "./jira/jira.module";
import { VectorModule } from "./vector/vector.module";
import { ConfluenceModule } from "./confluence/confluence.module";

@Module({
  imports: [
    McpModule,
    JiraModule,
    VectorModule, // ✅ додаємо модуль векторів
    ConfluenceModule, // ✅ додаємо модуль конфлюенсу
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
