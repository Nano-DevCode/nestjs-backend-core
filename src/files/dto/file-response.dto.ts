import { ApiProperty } from '@nestjs/swagger';

export class FileResponseDto {
  @ApiProperty({
    description:
      'Identificador o clave relativa del archivo en el almacenamiento',
    example: '1725973200000-contrato_anual.webp',
  })
  key!: string;

  @ApiProperty({
    description: 'Nombre del archivo asignado o nombre original',
    example: 'contrato_anual.png',
  })
  filename!: string;

  @ApiProperty({
    description: 'Nombre original del archivo subido',
    example: 'contrato_anual.png',
  })
  originalName!: string;

  @ApiProperty({
    description: 'Tipo MIME del archivo procesado',
    example: 'image/webp',
  })
  mimetype!: string;

  @ApiProperty({
    description: 'Tamaño del archivo en bytes',
    example: 245120,
  })
  size!: number;

  @ApiProperty({
    description: 'Bucket de resguardo en SeaweedFS / S3',
    example: 'sistema-files',
  })
  bucket!: string;

  @ApiProperty({
    description:
      'Ruta relativa del endpoint para visualización y streaming seguro',
    example: '/api/files/view/1725973200000-contrato_anual.webp',
  })
  url!: string;
}
