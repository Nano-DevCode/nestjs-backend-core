import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  IsArray,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UserProfileInputDto {
  @IsString({ message: 'El nombre del perfil debe ser una cadena de texto' })
  @IsOptional()
  firstName?: string;

  @IsString({ message: 'El apellido debe ser una cadena de texto' })
  @IsOptional()
  lastName?: string;

  @IsString({ message: 'La biografía debe ser una cadena de texto' })
  @IsOptional()
  bio?: string;

  @IsString({ message: 'La URL del avatar debe ser una cadena de texto' })
  @IsOptional()
  avatarUrl?: string;
}

export class CreateUserDto {
  @IsEmail(
    {},
    { message: 'El correo electrónico debe tener un formato válido' },
  )
  @IsNotEmpty({ message: 'El correo electrónico es requerido' })
  email!: string;

  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  password!: string;

  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsOptional()
  name?: string;

  @IsArray({ message: 'Los roles deben proporcionarse como un arreglo' })
  @IsString({ each: true, message: 'Cada rol debe ser una cadena de texto' })
  @IsOptional()
  roles?: string[];

  @IsBoolean({ message: 'isActive debe ser un booleano' })
  @IsOptional()
  isActive?: boolean;

  @ValidateNested()
  @Type(() => UserProfileInputDto)
  @IsOptional()
  profile?: UserProfileInputDto;
}

