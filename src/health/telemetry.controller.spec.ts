import { Test, TestingModule } from '@nestjs/testing';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import type { SystemTelemetryDto } from './dto/telemetry.dto';

describe('TelemetryController', () => {
  let controller: TelemetryController;
  let service: TelemetryService;

  const mockTelemetry: SystemTelemetryDto = {
    timestamp: new Date().toISOString(),
    uptimeSeconds: 120,
    queues: {
      pdf: {
        waiting: 0,
        active: 1,
        failed: 0,
        completed: 5,
        status: 'healthy',
      },
      logs: {
        waiting: 2,
        active: 0,
        failed: 0,
        completed: 25,
        status: 'healthy',
      },
      totalWaiting: 2,
      totalActive: 1,
      totalFailed: 0,
      status: 'healthy',
    },
    websockets: {
      connectedClients: 3,
      latencyMs: 1,
      status: 'online',
    },
    storage: {
      totalBytes: 53687091200,
      usedBytes: 1048576,
      freeBytes: 53686042624,
      usedPercentage: 0.1,
      totalFiles: 12,
      clamAvStatus: 'active',
    },
    security: {
      throttledRequestsLastHour: 0,
      blockedIpsCount: 0,
      blockedIps: [],
      firewallStatus: 'active',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelemetryController],
      providers: [
        {
          provide: TelemetryService,
          useValue: {
            getSystemTelemetry: jest.fn().mockResolvedValue(mockTelemetry),
          },
        },
      ],
    }).compile();

    controller = module.get<TelemetryController>(TelemetryController);
    service = module.get<TelemetryService>(TelemetryService);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });

  it('debe retornar las métricas operativas del sistema', async () => {
    const result = await controller.getTelemetry();
    expect(result).toEqual(mockTelemetry);
    expect(result.queues.totalActive).toBe(1);
    expect(result.websockets.connectedClients).toBe(3);
    expect(result.storage.clamAvStatus).toBe('active');
    expect(result.security.firewallStatus).toBe('active');
  });
});
