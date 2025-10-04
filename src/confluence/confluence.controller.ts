import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ConfluenceApiService } from "./confluence-api.service";
import { ExportConfluenceDto } from "./dto/export-confluence.dto";

@Controller("confluence")
export class ConfluenceApiController {
  constructor(private readonly confluenceApiService: ConfluenceApiService) {}

  /**
   * Експортує всі простори та сторінки з Confluence у JSON-файл.
   * Якщо передано { vectorize: true }, додатково виконується векторизація через OpenAI + Pinecone.
   *
   * @example
   * POST /confluence/export
   * {
   *   "vectorize": true,
   *   "pineconeNamespace": "confluence"
   * }
   */
  @Post("export")
  @HttpCode(HttpStatus.OK)
  async export(@Body() dto?: ExportConfluenceDto) {
    const options = dto ?? new ExportConfluenceDto();

    const result = await this.confluenceApiService.exportAllSpacesContent(
      options
    );

    return {
      ok: true,
      source: "confluence:api",
      file: result.file,
      spaceCount: result.spaceCount,
      pageCount: result.pageCount,
      ...(result.vectorization && {
        vectorization: result.vectorization,
      }),
    };
  }
}
