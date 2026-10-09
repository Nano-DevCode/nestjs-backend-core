import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { AlertSeverity } from '../alerts.service';

export class TestAlertDto {
  @IsString({ message: 'El título debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El título es requerido' })
  title!: string;

  @IsString({ message: 'El mensaje debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El mensaje es requerido' })
  message!: string;

  @IsOptional()
  @IsIn(['info', 'warning', 'error', 'critical'], {
    message: 'La severidad debe ser info, warning, error o critical',
  })
  severity?: AlertSeverity;

  @IsOptional()
  @IsString({ message: 'El origen debe ser una cadena de texto' })
  source?: string;

  @IsOptional()
  details?: Record<string, unknown>;
}

