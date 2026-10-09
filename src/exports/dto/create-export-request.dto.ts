import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import type { ExportFormat } from '../exports.interfaces';

export class CreateExportRequestDto {
  @IsOptional()
  @IsString({ message: 'El título debe ser una cadena de texto' })
  title?: string;

  @IsOptional()
  @IsIn(['csv', 'json', 'tsv'], {
    message: 'El formato de exportación debe ser csv, json o tsv',
  })
  format?: ExportFormat;

  @IsOptional()
  @IsString({ message: 'El tipo de dataset debe ser una cadena de texto' })
  datasetType?: string;

  @IsOptional()
  @IsArray({ message: 'records debe ser un arreglo de objetos' })
  records?: Record<string, unknown>[];

  @IsOptional()
  @IsArray({ message: 'columns debe ser un arreglo de cadenas' })
  @IsString({ each: true, message: 'Cada columna debe ser una cadena de texto' })
  columns?: string[];

  @IsOptional()
  filters?: Record<string, unknown>;
}

