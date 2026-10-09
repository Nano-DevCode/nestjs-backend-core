import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DispatchWebhookTestDto {
  @IsString({ message: 'El evento debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre del evento es requerido (ej: "test.event", "user.created")' })
  event!: string;

  @IsOptional()
  data?: unknown;
}

