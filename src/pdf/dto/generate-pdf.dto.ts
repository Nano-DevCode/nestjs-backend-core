import { IsString, IsNotEmpty, IsOptional, IsDefined } from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '../../common/scalar/scalar.decorators';

export class GeneratePdfDto {
  @ApiProperty({
    description:
      'Nombre de la plantilla a renderizar (kardex, boleta, constancia, default)',
    example: 'kardex',
  })
  @IsString({ message: 'El nombre de la plantilla debe ser un string' })
  @IsNotEmpty({ message: 'El nombre de la plantilla no puede estar vacío' })
  templateName!: string;

  @ApiProperty({
    description:
      'Datos del documento. Puede ser un objeto individual o un arreglo de N objetos para generar un PDF multi-página concatenado.',
    example: {
      alumno: 'Manuel Santiago',
      matricula: '2026-ENG-001',
      carrera: 'Ingeniería en Software',
      materias: [
        {
          clave: 'CS101',
          materia: 'Estructuras de Datos',
          creditos: 8,
          calificacion: 95,
          periodo: '2026-1',
        },
      ],
    },
  })
  @IsDefined({ message: 'Los datos para la plantilla son obligatorios' })
  data!: Record<string, any> | Record<string, any>[];

  @ApiPropertyOptional({
    description: 'Nombre de archivo sugerido (sin extensión requerida)',
    example: 'kardex_oficial_2026',
  })
  @IsOptional()
  @IsString({ message: 'El nombre de archivo debe ser un string' })
  filename?: string;
}
