import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class Toggle2FADto {
  @IsString({ message: 'El código debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El código de 6 dígitos es requerido' })
  @Matches(/^[0-9]{6}$/, {
    message: 'El código debe contener exactamente 6 dígitos numéricos',
  })
  code!: string;
}
