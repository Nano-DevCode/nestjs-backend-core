import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '../../common/scalar/scalar.decorators';

export class MobileLoginDto {
  @ApiProperty({
    description: 'Correo electrónico del usuario',
    example: 'usuario@empresa.com',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @IsNotEmpty({ message: 'El correo electrónico es requerido' })
  email!: string;

  @ApiProperty({
    description: 'Contraseña de la cuenta',
    example: 'P@sswordSegura123!',
  })
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  password!: string;

  @ApiPropertyOptional({
    description: 'Nombre descriptivo del dispositivo móvil',
    example: 'iPhone 15 Pro',
  })
  @IsOptional()
  @IsString({ message: 'El nombre del dispositivo debe ser una cadena' })
  @MaxLength(100, {
    message: 'El nombre del dispositivo no puede exceder 100 caracteres',
  })
  deviceName?: string;

  @ApiPropertyOptional({
    description: 'Identificador único del dispositivo móvil',
    example: 'uuid-device-12345',
  })
  @IsOptional()
  @IsString({ message: 'El ID del dispositivo debe ser una cadena' })
  @MaxLength(100, {
    message: 'El ID del dispositivo no puede exceder 100 caracteres',
  })
  deviceId?: string;
}

export class MobileRefreshDto {
  @ApiProperty({
    description: 'Token de refresco emitido previamente por la API móvil',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString({ message: 'El refresh token debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El refresh token es requerido' })
  refreshToken!: string;
}

export class MobileLogoutDto {
  @ApiPropertyOptional({
    description: 'Token de refresco específico a revocar (opcional)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsOptional()
  @IsString({ message: 'El refresh token debe ser una cadena de texto' })
  refreshToken?: string;
}

export class Mobile2FaAuthDto {
  @ApiProperty({
    description: 'Token temporal emitido tras un login exitoso con 2FA activo',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString({ message: 'El token temporal debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El token temporal es requerido' })
  tempToken!: string;

  @ApiProperty({
    description:
      'Código TOTP de 6 dígitos numéricos generado por la app autenticadora',
    example: '123456',
  })
  @IsString({ message: 'El código debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El código de 6 dígitos es requerido' })
  @Matches(/^[0-9]{6}$/, {
    message: 'El código debe contener exactamente 6 dígitos numéricos',
  })
  code!: string;
}
