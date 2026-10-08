import {
  getTemplateBuilder,
  kardexTemplate,
  boletaTemplate,
  constanciaTemplate,
  defaultTemplate,
} from './dynamic-templates';

describe('PDF Dynamic Templates', () => {
  const dummyContext = {
    data: {},
    qrDataUrl: 'data:image/png;base64,dummyqr',
    hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  };

  describe('getTemplateBuilder', () => {
    it('should resolve registered templates correctly', () => {
      expect(getTemplateBuilder('kardex')).toBe(kardexTemplate);
      expect(getTemplateBuilder('boleta')).toBe(boletaTemplate);
      expect(getTemplateBuilder('constancia')).toBe(constanciaTemplate);
      expect(getTemplateBuilder('default')).toBe(defaultTemplate);
    });

    it('should fallback to defaultTemplate for unknown template names', () => {
      expect(getTemplateBuilder('nonexistent_template')).toBe(defaultTemplate);
    });
  });

  describe('kardexTemplate', () => {
    it('should render kardex with courses array and grades correctly', () => {
      const context = {
        ...dummyContext,
        data: {
          alumno: 'Juan Perez',
          matricula: '21160787',
          carrera: 'Ingeniería en Sistemas',
          promedio: '92.5',
          creditosTotales: '260',
          materias: [
            { clave: 'CS101', materia: 'Programación', creditos: 5, calificacion: 95, periodo: '2025-1', estatus: 'APROBADA' },
            { clave: 'MA102', materia: 'Cálculo', creditos: 5, calificacion: 65, periodo: '2025-1', estatus: 'REPROBADA' },
          ],
        },
      };

      const content = kardexTemplate(context);
      expect(Array.isArray(content)).toBe(true);
      expect(content.length).toBeGreaterThan(0);
    });

    it('should handle kardex with empty courses', () => {
      const content = kardexTemplate({
        ...dummyContext,
        data: { materias: [] },
      });
      expect(Array.isArray(content)).toBe(true);
    });
  });

  describe('boletaTemplate', () => {
    it('should render boleta with grades table', () => {
      const context = {
        ...dummyContext,
        data: {
          alumno: 'Ana Lopez',
          matricula: '12345678',
          ciclo: '2026-A',
          grupo: '8A',
          promedio: '88',
          calificaciones: [
            { materia: 'Redes', p1: 80, p2: 90, p3: 95, final: 88 },
          ],
        },
      };

      const content = boletaTemplate(context);
      expect(Array.isArray(content)).toBe(true);
    });
  });

  describe('constanciaTemplate', () => {
    it('should render official study certificate', () => {
      const context = {
        ...dummyContext,
        data: {
          alumno: 'Pedro Gomez',
          matricula: '98765432',
          carrera: 'Licenciatura en Informática',
          semestre: '8vo',
          fecha: '8 de Octubre de 2026',
        },
      };

      const content = constanciaTemplate(context);
      expect(Array.isArray(content)).toBe(true);
    });
  });

  describe('defaultTemplate', () => {
    it('should render generic table for arbitrary key-value data', () => {
      const context = {
        ...dummyContext,
        data: {
          titulo: 'Reporte General',
          parametro1: 'Valor 1',
          parametro2: 1234,
        },
      };

      const content = defaultTemplate(context);
      expect(Array.isArray(content)).toBe(true);
    });
  });
});
