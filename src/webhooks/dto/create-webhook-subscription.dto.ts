import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';

export class CreateWebhookSubscriptionDto {
  @IsUrl(
    { require_tld: false, require_protocol: true },
    { message: 'La URL de destino debe ser una dirección web válida (http o https)' },
  )
  @IsNotEmpty({ message: 'La URL es requerida' })
  url!: string;

  @IsArray({ message: 'Los eventos deben ser un arreglo de cadenas' })
  @ArrayMinSize(1, { message: 'Debe especificar al menos un evento o "*"' })
  @IsString({ each: true, message: 'Cada evento debe ser una cadena de texto' })
  events!: string[];

  @IsOptional()
  @IsString({ message: 'El secreto debe ser una cadena de texto' })
  @MinLength(16, { message: 'El secreto debe tener al menos 16 caracteres' })
  secret?: string;

  @IsOptional()
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  description?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser booleano' })
  isActive?: boolean;
}

