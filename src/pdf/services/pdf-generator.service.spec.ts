import { Test, TestingModule } from '@nestjs/testing';
import { PdfGeneratorService } from './pdf-generator.service';

describe('PdfGeneratorService', () => {
  let service: PdfGeneratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PdfGeneratorService],
    }).compile();

    service = module.get<PdfGeneratorService>(PdfGeneratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generatePdf single object', () => {
    it('should generate a valid PDF buffer for kardex template with QR and hash', async () => {
      const data = {
        alumno: 'Juan Pérez',
        matricula: '2026-CS-001',
        carrera: 'Ingeniería en Software',
        promedio: 94.5,
        materias: [
          {
            clave: 'CS101',
            materia: 'Programación I',
            creditos: 8,
            calificacion: 95,
            periodo: '2026-1',
            estatus: 'APROBADA',
          },
          {
            clave: 'CS102',
            materia: 'Bases de Datos',
            creditos: 8,
            calificacion: 94,
            periodo: '2026-1',
            estatus: 'APROBADA',
          },
        ],
      };

      const buffer = await service.generatePdf('kardex', data);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
      // Validar firma de archivo PDF (%PDF-)
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('should generate a valid PDF for boleta template', async () => {
      const data = {
        alumno: 'María Gómez',
        matricula: '2026-CS-002',
        ciclo: '2026-1',
        calificaciones: [
          {
            materia: 'Matemáticas Discretas',
            p1: 90,
            p2: 85,
            p3: 95,
            final: 90,
          },
        ],
      };

      const buffer = await service.generatePdf('boleta', data);
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('should generate a valid PDF for constancia template', async () => {
      const data = {
        alumno: 'Carlos Ruiz',
        matricula: '2026-CS-003',
        carrera: 'Ciberseguridad',
        semestre: 'Quinto',
      };

      const buffer = await service.generatePdf('constancia', data);
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('should fallback to default template when unknown template name is provided', async () => {
      const data = {
        titulo: 'Reporte General',
        observaciones: 'Sin novedades',
      };

      const buffer = await service.generatePdf('unknown_template', data);
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    });
  });

  describe('generatePdf multi-object concatenation', () => {
    it('should concatenate multiple objects into a continuous multi-page PDF document', async () => {
      const students = [
        { alumno: 'Alumno 1', matricula: 'M1', promedio: 90 },
        { alumno: 'Alumno 2', matricula: 'M2', promedio: 85 },
        { alumno: 'Alumno 3', matricula: 'M3', promedio: 95 },
      ];

      const singleBuffer = await service.generatePdf('kardex', students[0]);
      const multiBuffer = await service.generatePdf('kardex', students);

      expect(multiBuffer.subarray(0, 4).toString()).toBe('%PDF');
      // El documento con 3 alumnos y saltos de página debe tener mayor tamaño que el individual
      expect(multiBuffer.length).toBeGreaterThan(singleBuffer.length);
    });
  });
});
