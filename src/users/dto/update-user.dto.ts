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
import { UserProfileInputDto } from './create-user.dto';

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
  @Type(() => UserProfileInputDto)
  @IsOptional()
  profile?: UserProfileInputDto;
}

