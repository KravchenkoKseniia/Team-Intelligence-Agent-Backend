import { IsBoolean, IsOptional, IsString } from "class-validator";

export class ExportConfluenceDto {
  @IsOptional()
  @IsBoolean()
  vectorize?: boolean = false;

  @IsOptional()
  @IsString()
  pineconeNamespace?: string = "confluence";
}
