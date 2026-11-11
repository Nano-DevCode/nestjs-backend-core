import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '../../common/scalar/scalar.decorators';
import { LogSource, LogLevel } from '../../../prisma/generated/prisma/client';

export class LogQueryDto {
  @ApiPropertyOptional({
    description: 'Página actual',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Cantidad de logs por página',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({
    enum: LogSource,
    description: 'Filtrar por origen (BACKEND o FRONTEND)',
  })
  @IsOptional()
  @IsEnum(LogSource)
  source?: LogSource;

  @ApiPropertyOptional({
    enum: LogLevel,
    description: 'Filtrar por nivel de severidad',
  })
  @IsOptional()
  @IsEnum(LogLevel)
  level?: LogLevel;

  @ApiPropertyOptional({
    description: 'Filtrar por contexto exacto',
    example: 'GlobalExceptionFilter',
  })
  @IsOptional()
  @IsString()
  context?: string;

  @ApiPropertyOptional({
    description: 'Término de búsqueda en mensaje o contexto',
    example: 'Database',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Fecha de inicio en formato ISO 8601',
    example: '2026-09-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Fecha de fin en formato ISO 8601',
    example: '2026-09-30T23:59:59.999Z',
  })
  @IsOptional()
  @IsISO8601()
  endDate?: string;
}
