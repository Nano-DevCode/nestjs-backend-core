import { IsBoolean, IsNotEmpty } from 'class-validator';
export class ToggleUserStatusDto {
  @IsNotEmpty({ message: 'El estado isActive es obligatorio' })
  @IsBoolean({ message: 'isActive debe ser un booleano (true o false)' })
  isActive!: boolean;
}
