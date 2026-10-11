import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';

export class AssignRolesDto {
  @IsArray({ message: 'roles debe ser un arreglo' })
  @ArrayNotEmpty({ message: 'Debes proporcionar al menos un rol' })
  @IsString({ each: true, message: 'Cada rol debe ser una cadena de texto' })
  roles!: string[];
}
