import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

function toBoolean(value: unknown, defaultValue = false): boolean {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

export class ExportConfluenceDto {
  @IsOptional()
  @Transform(({ value }) => toBoolean(value, false))
  @IsBoolean()
  vectorize = false;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  pineconeNamespace?: string;
}
