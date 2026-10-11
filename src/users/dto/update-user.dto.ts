import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  IsArray,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
export class UpdateUserProfileInputDto {
  @IsString({ message: 'El nombre(s) debe ser una cadena de texto' })
  @IsOptional()
  firstName?: string;

  @IsString({ message: 'El primer apellido debe ser una cadena de texto' })
  @IsOptional()
  firstLastName?: string;

  @IsString({ message: 'El segundo apellido debe ser una cadena de texto' })
  @IsOptional()
  secondLastName?: string;

  @IsString({ message: 'La biografía debe ser una cadena de texto' })

  @IsOptional()
  bio?: string;

  @IsString({ message: 'La URL del avatar debe ser una cadena de texto' })
  @IsOptional()
  avatarUrl?: string;
}

export class UpdateUserDto {
  @IsEmail(
    {},
    { message: 'El correo electrónico debe tener un formato válido' },
  )
  @IsOptional()
  email?: string;

  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @IsOptional()
  password?: string;

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
  @Type(() => UpdateUserProfileInputDto)
  @IsOptional()
  profile?: UpdateUserProfileInputDto;
}

