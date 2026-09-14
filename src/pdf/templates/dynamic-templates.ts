import type { Content, TableCell } from 'pdfmake/interfaces';

export interface TemplateContext {
  data: Record<string, unknown>;
  qrDataUrl: string;
  hash: string;
}

export type TemplateBuilder = (context: TemplateContext) => Content[];

const toStr = (val: unknown, fallback = ''): string => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') return val;
  if (
    typeof val === 'number' ||
    typeof val === 'boolean' ||
    typeof val === 'bigint'
  ) {
    return val.toString();
  }
  return fallback;
};

/**
 * Plantilla 1: KARDEX ACADÉMICO OFICIAL
 */
export const kardexTemplate: TemplateBuilder = ({ data, qrDataUrl, hash }) => {
  const rawCourses = data['materias'] || data['courses'];
  const courses: Record<string, unknown>[] = Array.isArray(rawCourses)
    ? (rawCourses as Record<string, unknown>[])
    : [];

  const tableBody: TableCell[][] = [
    [
      { text: 'Clave', bold: true, fillColor: '#1e293b', color: '#ffffff' },
      {
        text: 'Materia / Asignatura',
        bold: true,
        fillColor: '#1e293b',
        color: '#ffffff',
      },
      {
        text: 'Créditos',
        bold: true,
        alignment: 'center',
        fillColor: '#1e293b',
        color: '#ffffff',
      },
      {
        text: 'Calificación',
        bold: true,
        alignment: 'center',
        fillColor: '#1e293b',
        color: '#ffffff',
      },
      {
        text: 'Periodo',
        bold: true,
        alignment: 'center',
        fillColor: '#1e293b',
        color: '#ffffff',
      },
      {
        text: 'Estatus',
        bold: true,
        alignment: 'center',
        fillColor: '#1e293b',
        color: '#ffffff',
      },
    ],
  ];

  if (courses.length > 0) {
    courses.forEach((c) => {
      const calif = Number(c['calificacion'] || c['grade']);
      tableBody.push([
        { text: toStr(c['clave'] || c['code'], '---'), fontSize: 9 },
        { text: toStr(c['materia'] || c['name'], '---'), fontSize: 9 },
        {
          text: toStr(c['creditos'] || c['credits'], '0'),
          alignment: 'center',
          fontSize: 9,
        },
        {
          text: toStr(c['calificacion'] || c['grade'], '---'),
          alignment: 'center',
          bold: true,
          fontSize: 9,
          color: calif >= 70 ? '#0f766e' : '#b91c1c',
        },
        {
          text: toStr(c['periodo'] || c['period'], '---'),
          alignment: 'center',
          fontSize: 9,
        },
        {
          text: toStr(c['estatus'] || c['status'], 'APROBADA'),
          alignment: 'center',
          fontSize: 9,
        },
      ]);
    });
  } else {
    tableBody.push([
      {
        text: 'No se registran asignaturas cursadas',
        colSpan: 6,
        alignment: 'center',
        italics: true,
        fontSize: 9,
      },
      {},
      {},
      {},
      {},
      {},
    ]);
  }

  const alumno = toStr(
    data['alumno'] || data['studentName'],
    'Estudiante no especificado',
  );
  const matricula = toStr(data['matricula'] || data['enrollmentId'], '---');
  const carrera = toStr(
    data['carrera'] || data['program'],
    'Licenciatura General',
  );
  const promedio = toStr(data['promedio'] || data['gpa'], '---');
  const creditosTotales = toStr(
    data['creditosTotales'] || data['totalCredits'],
    '---',
  );

  return [
    {
      text: 'SISTEMA INSTITUCIONAL DE CONTROL ESCOLAR',
      style: 'header',
      alignment: 'center',
    },
    {
      text: 'KARDEX DE CALIFICACIONES HISTÓRICO',
      style: 'subheader',
      alignment: 'center',
      margin: [0, 2, 0, 15],
    },
    {
      table: {
        widths: ['25%', '75%'],
        body: [
          [{ text: 'Alumno:', bold: true }, { text: alumno }],
          [{ text: 'Matrícula:', bold: true }, { text: matricula }],
          [{ text: 'Carrera / Programa:', bold: true }, { text: carrera }],
          [
            { text: 'Promedio General:', bold: true },
            { text: promedio, bold: true },
          ],
          [{ text: 'Total Créditos:', bold: true }, { text: creditosTotales }],
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 15],
    },
    {
      table: {
        headerRows: 1,
        widths: ['12%', '40%', '12%', '12%', '12%', '12%'],
        body: tableBody,
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 20],
    },
    {
      columns: [
        {
          image: qrDataUrl,
          width: 75,
          height: 75,
        },
        [
          {
            text: 'Sello Digital de Validación Institucional',
            bold: true,
            fontSize: 9,
            margin: [0, 5, 0, 2],
          },
          { text: 'Hash de Integridad (SHA-256):', fontSize: 8, bold: true },
          { text: hash, fontSize: 7, color: '#475569', font: 'Roboto' },
          {
            text: `Fecha de emisión: ${new Date().toISOString()}`,
            fontSize: 7,
            color: '#64748b',
            margin: [0, 2, 0, 0],
          },
          {
            text: 'Este documento cuenta con validez oficial mediante firma electrónica y código QR verificable.',
            fontSize: 7,
            italic: true,
            color: '#64748b',
          },
        ],
      ],
      columnGap: 15,
      margin: [0, 10, 0, 0],
    },
  ];
};

/**
 * Plantilla 2: BOLETA DE CALIFICACIONES PARCIALES
 */
export const boletaTemplate: TemplateBuilder = ({ data, qrDataUrl, hash }) => {
  const rawGrades = data['calificaciones'] || data['grades'];
  const grades: Record<string, unknown>[] = Array.isArray(rawGrades)
    ? (rawGrades as Record<string, unknown>[])
    : [];

  const tableBody: TableCell[][] = [
    [
      { text: 'Materia', bold: true, fillColor: '#0369a1', color: '#ffffff' },
      {
        text: 'P1',
        bold: true,
        alignment: 'center',
        fillColor: '#0369a1',
        color: '#ffffff',
      },
      {
        text: 'P2',
        bold: true,
        alignment: 'center',
        fillColor: '#0369a1',
        color: '#ffffff',
      },
      {
        text: 'P3',
        bold: true,
        alignment: 'center',
        fillColor: '#0369a1',
        color: '#ffffff',
      },
      {
        text: 'Final',
        bold: true,
        alignment: 'center',
        fillColor: '#0369a1',
        color: '#ffffff',
      },
    ],
  ];

  grades.forEach((g) => {
    tableBody.push([
      { text: toStr(g['materia'] || g['subject'], '---'), fontSize: 9 },
      { text: toStr(g['p1'], '-'), alignment: 'center', fontSize: 9 },
      { text: toStr(g['p2'], '-'), alignment: 'center', fontSize: 9 },
      { text: toStr(g['p3'], '-'), alignment: 'center', fontSize: 9 },
      {
        text: toStr(g['final'], '-'),
        alignment: 'center',
        bold: true,
        fontSize: 9,
      },
    ]);
  });

  const alumno = toStr(data['alumno'] || data['studentName'], '---');
  const matricula = toStr(data['matricula'] || data['enrollmentId'], '---');
  const ciclo = toStr(data['ciclo'] || data['period'], 'Periodo Actual');
  const grupo = toStr(data['grupo'] || data['gradeGroup'], '---');
  const promedio = toStr(data['promedio'], '---');

  return [
    {
      text: 'BOLETA DE CALIFICACIONES EVALUATIVAS',
      style: 'header',
      alignment: 'center',
    },
    {
      text: `Ciclo: ${ciclo}`,
      style: 'subheader',
      alignment: 'center',
      margin: [0, 2, 0, 15],
    },
    {
      columns: [
        [
          { text: `Alumno: ${alumno}`, bold: true, fontSize: 10 },
          { text: `Matrícula: ${matricula}`, fontSize: 9 },
        ],
        [
          { text: `Grupo / Grado: ${grupo}`, fontSize: 9 },
          { text: `Promedio Periodo: ${promedio}`, bold: true, fontSize: 9 },
        ],
      ],
      margin: [0, 0, 0, 15],
    },
    {
      table: {
        headerRows: 1,
        widths: ['50%', '12%', '12%', '12%', '14%'],
        body: tableBody,
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 20],
    },
    {
      columns: [
        {
          image: qrDataUrl,
          width: 70,
          height: 70,
        },
        [
          { text: 'Verificación Electrónica', bold: true, fontSize: 9 },
          { text: `Hash SHA-256: ${hash}`, fontSize: 7, color: '#475569' },
          {
            text: 'Escanea el código QR para validar la autenticidad en la plataforma central.',
            fontSize: 8,
            italic: true,
            color: '#64748b',
          },
        ],
      ],
      columnGap: 10,
    },
  ];
};

/**
 * Plantilla 3: CONSTANCIA DE ESTUDIOS
 */
export const constanciaTemplate: TemplateBuilder = ({
  data,
  qrDataUrl,
  hash,
}) => {
  const alumno = toStr(
    data['alumno'] || data['studentName'],
    'EL/LA C. INTERESADO(A)',
  );
  const matricula = toStr(
    data['matricula'] || data['enrollmentId'],
    'NO ESPECIFICADA',
  );
  const carrera = toStr(
    data['carrera'] || data['program'],
    'PLAN DE ESTUDIOS VIGENTE',
  );
  const semestre = toStr(data['semestre'] || data['semester'], 'ACTUAL');
  const fecha = toStr(
    data['fecha'],
    new Date().toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  );

  return [
    {
      text: 'A QUIEN CORRESPONDA:',
      bold: true,
      fontSize: 12,
      margin: [0, 20, 0, 20],
    },
    {
      text: [
        'La Dirección de Servicios Escolares hace constar que el(la) alumno(a) ',
        { text: alumno, bold: true },
        ', con matrícula ',
        { text: matricula, bold: true },
        ', se encuentra actualmente inscrito(a) como estudiante regular del programa académico de ',
        { text: carrera, bold: true },
        `, cursando el periodo correspondiente al ${semestre} ciclo escolar.`,
      ],
      alignment: 'justify',
      lineHeight: 1.6,
      fontSize: 11,
      margin: [0, 0, 0, 20],
    },
    {
      text: `Se extiende la presente constancia para los fines legales y administrativos que al interesado convengan, en la fecha: ${fecha}.`,
      alignment: 'justify',
      lineHeight: 1.5,
      fontSize: 11,
      margin: [0, 0, 0, 40],
    },
    { text: 'ATENTAMENTE', alignment: 'center', bold: true, fontSize: 10 },
    {
      text: 'DIRECCIÓN DE CONTROL ESCOLAR Y SERVICIOS EDUCATIVOS',
      alignment: 'center',
      fontSize: 9,
      margin: [0, 4, 0, 30],
    },
    {
      columns: [
        {
          image: qrDataUrl,
          width: 75,
          height: 75,
        },
        [
          { text: 'Constancia Digital Certificada', bold: true, fontSize: 9 },
          {
            text: `Hash de Verificación: ${hash}`,
            fontSize: 7,
            color: '#475569',
          },
          {
            text: 'Verificación descentralizada y cotejo seguro en línea.',
            fontSize: 8,
            italic: true,
            color: '#64748b',
          },
        ],
      ],
      columnGap: 15,
    },
  ];
};

/**
 * Plantilla de Respaldo / Genérica
 */
export const defaultTemplate: TemplateBuilder = ({ data, qrDataUrl, hash }) => {
  const entries = Object.entries(data).filter(
    ([k]) => typeof data[k] !== 'object',
  );
  const tableBody: TableCell[][] = entries.map(([key, val]) => [
    { text: key, bold: true, fontSize: 9 },
    { text: toStr(val), fontSize: 9 },
  ]);

  const titulo = toStr(data['titulo'], 'REPORTE Y REGISTRO DE DATOS');

  return [
    {
      text: titulo,
      style: 'header',
      alignment: 'center',
      margin: [0, 0, 0, 15],
    },
    {
      table: {
        widths: ['35%', '65%'],
        body:
          tableBody.length > 0
            ? tableBody
            : [[{ text: 'Sin datos' }, { text: '---' }]],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 20],
    },
    {
      columns: [
        { image: qrDataUrl, width: 70, height: 70 },
        [
          { text: 'Identificador y Firma Digital', bold: true, fontSize: 9 },
          { text: `Hash: ${hash}`, fontSize: 7, color: '#475569' },
        ],
      ],
      columnGap: 10,
    },
  ];
};

export const TEMPLATE_REGISTRY: Record<string, TemplateBuilder> = {
  kardex: kardexTemplate,
  boleta: boletaTemplate,
  constancia: constanciaTemplate,
  default: defaultTemplate,
};

export function getTemplateBuilder(name: string): TemplateBuilder {
  const normalized = name.toLowerCase().trim();
  return TEMPLATE_REGISTRY[normalized] || TEMPLATE_REGISTRY['default'];
}
