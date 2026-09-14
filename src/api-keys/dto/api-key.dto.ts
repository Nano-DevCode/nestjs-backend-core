import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '../../common/scalar/scalar.decorators';

export class CreateApiKeyDto {
  @ApiProperty({
    description: 'Nombre descriptivo de la API Key o del partner/integración',
    example: 'Integración Sistema Escolar - Partner Alpha',
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Lista de permisos/scopes otorgados a esta API Key',
    example: ['students:read', 'grades:verify'],
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: 'Los scopes deben ser un arreglo de strings' })
  @IsString({ each: true, message: 'Cada scope debe ser una cadena de texto' })
  scopes?: string[];

  @ApiPropertyOptional({
    description: 'Límite de peticiones por minuto permitido para esta llave',
    example: 60,
    default: 60,
  })
  @IsOptional()
  @IsInt({ message: 'El rate limit debe ser un número entero' })
  @Min(1, { message: 'El rate limit mínimo es 1' })
  @Max(10000, { message: 'El rate limit máximo es 10000' })
  rateLimit?: number;

  @ApiPropertyOptional({
    description: 'Fecha límite de expiración de la llave en formato ISO-8601',
    example: '2027-12-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString(
    {},
    { message: 'La fecha de expiración debe ser una fecha ISO válida' },
  )
  expiresAt?: string;
}
