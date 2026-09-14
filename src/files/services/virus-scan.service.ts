import {
  Injectable,
  Logger,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { Readable } from 'stream';
import NodeClam from 'clamscan';

@Injectable()
export class VirusScanService implements OnModuleInit {
  private readonly logger = new Logger(VirusScanService.name);
  private clamscan: NodeClam | null = null;
  private isAvailable = false;

  async onModuleInit(): Promise<void> {
    await this.initClamAV();
  }

  private async initClamAV(): Promise<void> {
    const host = process.env['CLAMAV_HOST'] || 'localhost';
    const port = Number(process.env['CLAMAV_PORT']) || 3310;

    try {
      this.clamscan = await new NodeClam().init({
        clamdscan: {
          host,
          port,
          timeout: 10000,
          localFallback: false,
          bypassTest: false,
        },
        preference: 'clamdscan',
      });
      this.isAvailable = true;
      this.logger.log(`Conectado a ClamAV daemon en ${host}:${port}`);
    } catch (error) {
      this.isAvailable = false;
      this.logger.warn(
        `No fue posible conectar con ClamAV en ${host}:${port} (${(error as Error).message}). Se operará en contingencia si el contenedor está iniciando.`,
      );
    }
  }

  getIsAvailable(): boolean {
    return this.isAvailable;
  }

  async scanBuffer(buffer: Buffer): Promise<void> {
    if (!this.clamscan || !this.isAvailable) {
      await this.initClamAV();
    }

    if (!this.clamscan || !this.isAvailable) {
      this.logger.warn(
        'ClamAV daemon no disponible en este momento. Se permite la operación bajo contingencia.',
      );
      return;
    }

    try {
      const stream = Readable.from(buffer);
      const result = await this.clamscan.scanStream(stream);

      if (result.isInfected || (result.viruses && result.viruses.length > 0)) {
        const virusList = result.viruses
          ? result.viruses.join(', ')
          : 'Desconocido';
        this.logger.error(`Malware detectado en el archivo: ${virusList}`);
        throw new BadRequestException(
          'El archivo subido está infectado o contiene malware y fue rechazado',
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Error durante el escaneo antivirus con ClamAV: ${(error as Error).message}`,
      );
    }
  }
}
