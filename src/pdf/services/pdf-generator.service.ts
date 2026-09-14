import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import * as path from 'path';
import * as fs from 'fs';
import pdfmake from 'pdfmake';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { getTemplateBuilder } from '../templates/dynamic-templates';

@Injectable()
export class PdfGeneratorService implements OnModuleInit {
  private readonly logger = new Logger(PdfGeneratorService.name);
  private fontsConfigured = false;

  onModuleInit(): void {
    this.configurePdfMake();
  }

  /**
   * Configura fuentes Roboto locales empaquetadas en pdfmake y políticas de aislamiento.
   */
  private configurePdfMake(): void {
    if (this.fontsConfigured) return;

    try {
      // 1. Determinar ruta local hacia las fuentes Roboto en node_modules
      let robotoDir = path.resolve(
        process.cwd(),
        'node_modules',
        'pdfmake',
        'fonts',
        'Roboto',
      );
      if (!fs.existsSync(robotoDir)) {
        // Fallback relativo por si corre desde dist o monorepo
        try {
          const pdfMakePkg = require.resolve('pdfmake/package.json');
          robotoDir = path.join(path.dirname(pdfMakePkg), 'fonts', 'Roboto');
        } catch {
          // Mantener robotoDir por defecto
        }
      }

      pdfmake.addFonts({
        Roboto: {
          normal: path.join(robotoDir, 'Roboto-Regular.ttf'),
          bold: path.join(robotoDir, 'Roboto-Medium.ttf'),
          italics: path.join(robotoDir, 'Roboto-Italic.ttf'),
          bolditalics: path.join(robotoDir, 'Roboto-MediumItalic.ttf'),
        },
      });

      // 2. Políticas de seguridad on-premise: denegar descargas web externas, permitir archivos locales
      pdfmake.setUrlAccessPolicy(() => false);
      pdfmake.setLocalAccessPolicy(() => true);

      this.fontsConfigured = true;
      this.logger.log(
        `Fuentes y políticas de seguridad para pdfmake inicializadas exitosamente desde: ${robotoDir}`,
      );
    } catch (error) {
      this.logger.error(
        `Error inicializando fuentes de pdfmake: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Genera un documento PDF unificado aplicando una plantilla sobre uno o varios objetos.
   * Si recibe N objetos, concatena cada uno en páginas continuas separadas por pageBreak: 'after'.
   */
  async generatePdf(
    templateName: string,
    data: Record<string, unknown> | Record<string, unknown>[],
  ): Promise<Buffer> {
    this.configurePdfMake();

    const items: Record<string, unknown>[] = Array.isArray(data)
      ? data
      : [data];
    const templateBuilder = getTemplateBuilder(templateName);
    const allContents: Content[] = [];

    for (let i = 0; i < items.length; i++) {
      const item: Record<string, unknown> = items[i] || {};

      // 1. Cálculo criptográfico SHA-256 de los datos del objeto para verificar integridad
      const canonicalJson = JSON.stringify(item, Object.keys(item).sort());
      const hash = crypto
        .createHash('sha256')
        .update(canonicalJson)
        .digest('hex');

      // 2. Generación del código QR vectorial en base64
      const itemId =
        (typeof item['id'] === 'string' && item['id']) ||
        (typeof item['matricula'] === 'string' && item['matricula']) ||
        (typeof item['alumno'] === 'string' && item['alumno']) ||
        `doc-${i + 1}`;

      const qrPayload = JSON.stringify({
        t: templateName,
        h: hash.slice(0, 16),
        id: itemId,
        ts: Date.now(),
      });

      const qrDataUrl = await QRCode.toDataURL(qrPayload, {
        margin: 1,
        width: 140,
        errorCorrectionLevel: 'M',
      });

      // 3. Renderizar contenido según plantilla
      const itemContent: Content[] = templateBuilder({
        data: item,
        qrDataUrl,
        hash,
      });

      allContents.push(...itemContent);

      // 4. Inserción de salto de página si no es el último objeto
      if (i < items.length - 1) {
        allContents.push({
          text: '',
          pageBreak: 'after',
        });
      }
    }

    const docDefinition: TDocumentDefinitions = {
      content: allContents,
      defaultStyle: {
        font: 'Roboto',
        fontSize: 10,
        color: '#1e293b',
      },
      styles: {
        header: {
          fontSize: 13,
          bold: true,
          color: '#0f172a',
        },
        subheader: {
          fontSize: 10,
          bold: true,
          color: '#334155',
        },
      },
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          {
            text: `Sistema Académico On-Premise | Plantilla: ${templateName}`,
            fontSize: 7,
            color: '#94a3b8',
          },
          {
            text: `Página ${currentPage} de ${pageCount}`,
            alignment: 'right',
            fontSize: 7,
            color: '#94a3b8',
          },
        ],
        margin: [40, 15, 40, 0],
      }),
      pageMargins: [40, 40, 40, 40],
    };

    const pdfDoc = pdfmake.createPdf(docDefinition);
    return pdfDoc.getBuffer();
  }
}
