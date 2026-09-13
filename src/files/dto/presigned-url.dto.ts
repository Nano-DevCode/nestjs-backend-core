import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '../../common/scalar/scalar.decorators';
import { MAX_FILE_SIZE } from '../files.constants';

export class CreatePresignedUrlDto {
  @ApiProperty({
    description: 'Nombre del archivo a subir (incluyendo extensión)',
    example: 'comprobante.pdf',
  })
  @IsString({ message: 'El nombre del archivo debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre del archivo es requerido' })
  filename!: string;

  @ApiProperty({
    description: 'Tipo MIME del archivo',
    example: 'application/pdf',
  })
  @IsString({ message: 'El tipo de contenido (mimetype) es requerido' })
  @IsNotEmpty({ message: 'El contentType es requerido' })
  contentType!: string;

  @ApiProperty({
    description: 'Tamaño del archivo en bytes (máximo 5 MB)',
    example: 1024000,
  })
  @IsInt({
    message: 'El tamaño del archivo debe ser un número entero en bytes',
  })
  @Min(1, { message: 'El tamaño mínimo es 1 byte' })
  @Max(MAX_FILE_SIZE, {
    message: 'El archivo excede el tamaño máximo permitido de 5 MB',
  })
  fileSize!: number;

  @ApiPropertyOptional({
    description: 'Bucket de destino en SeaweedFS (opcional)',
    example: 'sistema-files',
  })
  @IsOptional()
  @IsString()
  bucket?: string;
}

export class ConfirmUploadDto {
  @ApiProperty({
    description: 'Clave única del archivo devuelta por presigned-url',
    example: 'uuid-12345.pdf',
  })
  @IsString()
  @IsNotEmpty({ message: 'La clave del archivo (fileKey) es requerida' })
  fileKey!: string;

  @ApiPropertyOptional({
    description: 'Bucket donde se alojó el archivo',
    example: 'sistema-files',
  })
  @IsOptional()
  @IsString()
  bucket?: string;

  @ApiProperty({
    description: 'Nombre original del archivo',
    example: 'comprobante.pdf',
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre original del archivo es requerido' })
  originalName!: string;

  @ApiProperty({
    description: 'Mimetype del archivo subido',
    example: 'application/pdf',
  })
  @IsString()
  @IsNotEmpty({ message: 'El mimetype es requerido' })
  mimetype!: string;

  @ApiProperty({
    description: 'Tamaño en bytes del archivo confirmado',
    example: 1024000,
  })
  @IsInt()
  @Min(1)
  size!: number;
}
