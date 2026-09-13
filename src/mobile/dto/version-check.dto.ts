import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '../../common/scalar/scalar.decorators';

export enum MobilePlatform {
  ANDROID = 'android',
  IOS = 'ios',
}

export class VersionCheckDto {
  @ApiProperty({
    description: 'Plataforma del cliente móvil',
    enum: MobilePlatform,
    example: MobilePlatform.ANDROID,
  })
  @IsEnum(MobilePlatform, {
    message: 'La plataforma debe ser "android" o "ios"',
  })
  @IsNotEmpty({ message: 'La plataforma es requerida' })
  platform!: MobilePlatform;

  @ApiPropertyOptional({
    description: 'Versión actual instalada en el dispositivo (SemVer)',
    example: '1.0.0',
  })
  @IsOptional()
  @IsString({ message: 'La versión actual debe ser una cadena de texto' })
  currentVersion?: string;
}
