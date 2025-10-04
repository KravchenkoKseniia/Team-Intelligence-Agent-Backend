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

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;

export class ListJiraProjectsDto {
  @IsUrl({ require_tld: true, require_protocol: true })
  jiraUrl!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(1, 2048)
  apiKey!: string;

  @IsOptional()
  @Transform(({ value }) => {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  })
  @IsInt()
  @Min(0)
  startAt: number = 0;

  @IsOptional()
  @Transform(({ value }) => {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? DEFAULT_LIMIT : parsed;
  })
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit: number = DEFAULT_LIMIT;
}
