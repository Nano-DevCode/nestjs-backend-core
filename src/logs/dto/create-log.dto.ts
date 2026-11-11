import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '../../common/scalar/scalar.decorators';
import { LogSource, LogLevel } from '../../../prisma/generated/prisma/client';

export class CreateLogItemDto {
  @IsEnum(LogSource)
  source!: LogSource;

  @IsEnum(LogLevel)
  level!: LogLevel;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  context!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsString()
  stackTrace?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  userId?: string;
}

export class ClientLogDto {
  @ApiProperty({
    enum: LogLevel,
    example: LogLevel.ERROR,
    description: 'Nivel de severidad del evento',
  })
  @IsEnum(LogLevel)
  level: LogLevel = LogLevel.ERROR;

  @ApiProperty({
    example: 'ErrorBoundaryReact',
    description: 'Contexto o componente donde se originó el error',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  context!: string;

  @ApiProperty({
    example: 'Cannot read properties of undefined (reading "map")',
    description: 'Mensaje descriptivo del error o evento',
  })
  @IsString()
  @IsNotEmpty()
  message!: string;

  @ApiPropertyOptional({
    description: 'Rastreo de pila (stack trace) del error',
  })
  @IsOptional()
  @IsString()
  stackTrace?: string;

  @ApiPropertyOptional({
    description: 'Metadatos adicionales (URL, userAgent, estados relevantes)',
  })
  @IsOptional()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'ID de usuario autenticado si está disponible',
  })
  @IsOptional()
  @IsString()
  userId?: string;
}
