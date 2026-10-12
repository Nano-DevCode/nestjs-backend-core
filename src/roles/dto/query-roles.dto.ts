import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  Max,
  IsIn,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '../../common/scalar/scalar.decorators';

export class QueryRolesDto {
  @ApiPropertyOptional({
    description: 'Número de página actual',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero.' })
  @Min(1, { message: 'La página mínima es 1.' })
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Cantidad de roles por página',
    example: 10,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero.' })
  @Min(1, { message: 'El límite mínimo es 1.' })
  @Max(100, { message: 'El límite máximo es 100.' })
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Término de búsqueda por nombre o descripción',
    example: 'admin',
  })
  @IsOptional()
  @IsString({ message: 'El término de búsqueda debe ser un texto.' })
  search?: string;

  @ApiPropertyOptional({
    description: 'Campo por el cual ordenar los resultados',
    example: 'priority',
    enum: ['name', 'priority', 'createdAt'],
    default: 'priority',
  })
  @IsOptional()
  @IsIn(['name', 'priority', 'createdAt'], {
    message: 'El campo de ordenamiento debe ser name, priority o createdAt.',
  })
  sortBy?: 'name' | 'priority' | 'createdAt' = 'priority';

  @ApiPropertyOptional({
    description: 'Dirección del ordenamiento',
    example: 'desc',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'], {
    message: 'La dirección de ordenamiento debe ser asc o desc.',
  })
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({
    description: 'Indica si se deben devolver todos los roles sin paginar',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  all?: boolean;
}
