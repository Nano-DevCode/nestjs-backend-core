import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @IsString({ message: 'El nombre(s) debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre(s) es obligatorio' })
  firstName!: string;

  @IsString({ message: 'El primer apellido debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El primer apellido es obligatorio' })
  firstLastName!: string;

  @IsString({ message: 'El segundo apellido debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El segundo apellido es obligatorio' })
  secondLastName!: string;

  @IsString({ message: 'La biografía debe ser una cadena de texto' })
  @IsOptional()
  bio?: string;

  @IsString({ message: 'La URL del avatar debe ser una cadena de texto' })
  @IsOptional()
  avatarUrl?: string;
}

