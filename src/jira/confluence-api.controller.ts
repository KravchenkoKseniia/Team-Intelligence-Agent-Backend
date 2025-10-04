import { Controller, Post, HttpCode, HttpStatus } from "@nestjs/common";
import { ConfluenceApiService } from "./confluence-api.service";

@Controller("confluence")
export class ConfluenceApiController {
  constructor(private readonly confluenceApiService: ConfluenceApiService) {}

  @Post("export")
  @HttpCode(HttpStatus.OK)
  async export() {
    const file = await this.confluenceApiService.exportAllSpacesContent();
    return { ok: true, file };
  }
}
