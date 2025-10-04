import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from 'class-validator';

export const ISSUE_EXPORT_LIMIT = 2_000;
export const DEFAULT_ISSUE_BATCH_SIZE = 100;
export const MAX_ISSUE_BATCH_SIZE = 100;
export const DEFAULT_PROJECT_BATCH_SIZE = 50;
export const MAX_PROJECT_BATCH_SIZE = 1_000;

export class ExportJiraIssuesDto {
  @IsOptional()
  @IsUrl({ require_tld: true, require_protocol: true })
  jiraUrl?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2048)
  apiKey?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? ISSUE_EXPORT_LIMIT : parsed;
  })
  @IsInt()
  @Min(1)
  @Max(ISSUE_EXPORT_LIMIT)
  limit: number = ISSUE_EXPORT_LIMIT;

  @IsOptional()
  @Transform(({ value }) => {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? DEFAULT_ISSUE_BATCH_SIZE : parsed;
  })
  @IsInt()
  @Min(1)
  @Max(MAX_ISSUE_BATCH_SIZE)
  issueBatchSize: number = DEFAULT_ISSUE_BATCH_SIZE;

  @IsOptional()
  @Transform(({ value }) => {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? DEFAULT_PROJECT_BATCH_SIZE : parsed;
  })
  @IsInt()
  @Min(1)
  @Max(MAX_PROJECT_BATCH_SIZE)
  projectBatchSize: number = DEFAULT_PROJECT_BATCH_SIZE;
}
