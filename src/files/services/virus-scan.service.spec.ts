import { BadRequestException } from '@nestjs/common';
import { VirusScanService } from './virus-scan.service';

describe('VirusScanService', () => {
  let service: VirusScanService;

  beforeEach(() => {
    service = new VirusScanService();
    // Prevenir intento de conexión de red real al daemon ClamAV durante los tests unitarios
    jest.spyOn(service as any, 'initClamAV').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('debe operar en contingencia si ClamAV no está disponible sin arrojar error fatal', async () => {
    (service as any).isAvailable = false;
    (service as any).clamscan = null;

    const cleanBuffer = Buffer.from('Contenido seguro de prueba');
    await expect(service.scanBuffer(cleanBuffer)).resolves.not.toThrow();
  });

  it('debe lanzar BadRequestException si el escaneo detecta malware', async () => {
    const infectedBuffer = Buffer.from('Malware signature test');

    (service as any).clamscan = {
      scanStream: jest.fn().mockResolvedValue({
        isInfected: true,
        viruses: ['Eicar-Test-Signature'],
      }),
    };
    (service as any).isAvailable = true;

    await expect(service.scanBuffer(infectedBuffer)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('debe completar el escaneo satisfactoriamente si el archivo está limpio', async () => {
    const cleanBuffer = Buffer.from('Contenido seguro');

    (service as any).clamscan = {
      scanStream: jest.fn().mockResolvedValue({
        isInfected: false,
        viruses: [],
      }),
    };
    (service as any).isAvailable = true;

    await expect(service.scanBuffer(cleanBuffer)).resolves.not.toThrow();
  });
});

