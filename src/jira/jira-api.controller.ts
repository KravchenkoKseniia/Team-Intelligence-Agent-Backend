import { Controller, Post, HttpCode, HttpStatus } from "@nestjs/common";
import { JiraApiService } from "./jira-api.service";

@Controller("jira")
export class JiraApiController {
  constructor(private readonly jiraApiService: JiraApiService) {}

  @Post("export")
  @HttpCode(HttpStatus.OK)
  async export() {
    const file = await this.jiraApiService.exportAllIssues();

    return { ok: true, file };
  }
}
