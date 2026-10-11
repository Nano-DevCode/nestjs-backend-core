import { IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryUsersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  user_page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  user_limit?: number;

  // Por compatibilidad si alguna vez se envía ?page o ?limit
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  status?: 'active' | 'deleted' | 'all';
}
