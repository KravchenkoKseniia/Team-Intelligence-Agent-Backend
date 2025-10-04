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
import { DEFAULT_JQL, DEFAULT_LIMIT } from './preview-jira.dto';

export class PreviewJiraDirectDto {
  @IsUrl({ require_tld: true, require_protocol: true })
  jiraUrl!: string;

  @IsEmail()
  email!: string;

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
