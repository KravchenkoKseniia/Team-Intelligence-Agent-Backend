import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from 'class-validator';

export const DEFAULT_JQL = 'order by created desc';
export const DEFAULT_LIMIT = 3;

export class PreviewJiraDto {
  @IsUrl({ require_tld: true, require_protocol: true })
  jiraUrl!: string;

  @IsString()
  @Length(1, 2048)
  apiKey!: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  @Transform(({ value }) => (typeof value === 'string' ? value : DEFAULT_JQL))
  jql: string = DEFAULT_JQL;

  @IsOptional()
  @Transform(({ value }) => {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? DEFAULT_LIMIT : parsed;
  })
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = DEFAULT_LIMIT;
}
