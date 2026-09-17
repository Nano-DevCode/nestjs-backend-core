import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '../../common/scalar/scalar.decorators';

export class NotificationQueryDto {
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
    description: 'Cantidad de elementos por página',
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
    description: 'Filtrar por leídas (true) o no leídas (false)',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  isRead?: boolean;

  @ApiPropertyOptional({
    description: 'Filtrar exclusivamente no leídas',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  unreadOnly?: boolean;
}

export class CreateNotificationDto {
  @ApiPropertyOptional({
    description: 'ID del usuario destinatario (UUID)',
    example: 'c7b3d8e0-1234-5678-9abc-def012345678',
  })
  @IsOptional()
  @IsString({ message: 'El userId debe ser un string' })
  userId?: string;

  @ApiPropertyOptional({
    description:
      'Correo electrónico del usuario destinatario (alternativa a userId)',
    example: 'usuario@empresa.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'El email debe tener un formato válido' })
  email?: string;

  @ApiProperty({
    description: 'Título descriptivo de la notificación',
    example: 'Aviso de Pago Pendiente',
  })
  @IsString({ message: 'El título debe ser un string' })
  @IsNotEmpty({ message: 'El título es obligatorio' })
  title!: string;

  @ApiProperty({
    description: 'Cuerpo o contenido detallado de la notificación',
    example: 'Hola Juan, recuerda que tu fecha límite de pago es mañana.',
  })
  @IsString({ message: 'El cuerpo debe ser un string' })
  @IsNotEmpty({ message: 'El cuerpo del mensaje es obligatorio' })
  body!: string;

  @ApiPropertyOptional({
    description:
      'Tipo o severidad de la alerta (INFO, WARNING, ERROR, SUCCESS)',
    example: 'WARNING',
    default: 'INFO',
  })
  @IsOptional()
  @IsString({ message: 'El tipo debe ser un string' })
  type?: string;

  @ApiPropertyOptional({
    description: 'Metadatos u objeto adicional en formato JSON',
    example: { link: '/dashboard/facturacion' },
  })
  @IsOptional()
  @IsObject({ message: 'data debe ser un objeto JSON válido' })
  data?: Record<string, unknown>;
}
