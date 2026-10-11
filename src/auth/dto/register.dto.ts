import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail(
    {},
    { message: 'El correo electrónico debe tener un formato válido' },
  )
  @IsNotEmpty({ message: 'El correo electrónico es requerido' })
  email!: string;

  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[\d\W_]).+$/, {
    message:
      'La contraseña debe contener al menos una mayúscula, una minúscula y un número o símbolo',
  })
  password!: string;

  @IsString({ message: 'El nombre(s) debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre(s) es obligatorio' })
  firstName!: string;

  @IsString({ message: 'El primer apellido debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El primer apellido es obligatorio' })
  firstLastName!: string;

  @IsString({ message: 'El segundo apellido debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El segundo apellido es obligatorio' })
  secondLastName!: string;

  @IsString({ message: 'El nombre completo debe ser una cadena de texto' })
  @IsOptional()
  name?: string;
}

