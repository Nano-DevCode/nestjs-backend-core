import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  Matches,
  IsArray,
  IsUUID,
} from 'class-validator';

export class UpdateRoleDto {
  @IsOptional()
  @IsString({ message: 'El nombre del rol debe ser un texto.' })
  @Matches(/^[a-z0-9_-]+$/, {
    message:
      'El nombre del rol solo puede contener letras minúsculas, números, guiones y guiones bajos (ej: gestor_archivos).',
  })
  name?: string;

  @IsOptional()
  @IsString({ message: 'La descripción debe ser un texto.' })
  description?: string;

  @IsOptional()
  @IsInt({ message: 'La prioridad debe ser un número entero.' })
  @Min(1, { message: 'La prioridad mínima permitida es 1.' })
  @Max(99, {
    message: 'La prioridad máxima permitida para roles personalizados es 99.',
  })
  priority?: number;

  @IsOptional()
  @IsArray({ message: 'permissionIds debe ser un arreglo de identificadores.' })
  @IsUUID('4', { each: true, message: 'Cada permiso debe ser un UUID válido.' })
  permissionIds?: string[];
}

