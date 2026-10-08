import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { TelemetryService } from './telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { PDF_QUEUE } from '../pdf/pdf.constants';
import { LOGS_QUEUE } from '../logs/logs.constants';
import { NotificationGateway } from '../notifications/notifications.gateway';
import { VirusScanService } from '../files/services/virus-scan.service';

describe('TelemetryService', () => {
  let service: TelemetryService;
  let pdfQueueMock: { getJobCounts: jest.Mock };
  let logsQueueMock: { getJobCounts: jest.Mock };
  let notificationGatewayMock: { getConnectedSocketsCount: jest.Mock };
  let prismaMock: { storedFile: { aggregate: jest.Mock } };
  let redisMock: { get: jest.Mock; zrevrange: jest.Mock };
  let virusScanMock: { getIsAvailable: jest.Mock };

  beforeEach(async () => {
    pdfQueueMock = {
      getJobCounts: jest.fn().mockResolvedValue({
        waiting: 2,
        active: 1,
        failed: 0,
        completed: 10,
      }),
    };

    logsQueueMock = {
      getJobCounts: jest.fn().mockResolvedValue({
        waiting: 0,
        active: 0,
        failed: 0,
        completed: 50,
      }),
    };

    notificationGatewayMock = {
      getConnectedSocketsCount: jest.fn().mockReturnValue(3),
    };

    prismaMock = {
      storedFile: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { size: 104857600 }, // 100 MB
          _count: 25,
        }),
      },
    };

    redisMock = {
      get: jest.fn().mockResolvedValue('5'),
      zrevrange: jest.fn().mockResolvedValue(['192.168.1.10', '192.168.1.20']),
    };

    virusScanMock = {
      getIsAvailable: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelemetryService,
        { provide: getQueueToken(PDF_QUEUE), useValue: pdfQueueMock },
        { provide: getQueueToken(LOGS_QUEUE), useValue: logsQueueMock },
        { provide: NotificationGateway, useValue: notificationGatewayMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: REDIS_CLIENT, useValue: redisMock },
        { provide: VirusScanService, useValue: virusScanMock },
      ],
    }).compile();

    service = module.get<TelemetryService>(TelemetryService);
  });

  describe('getSystemTelemetry', () => {
    it('debe recopilar y formatear la telemetría global del sistema', async () => {
      const telemetry = await service.getSystemTelemetry();

      expect(telemetry).toHaveProperty('timestamp');
      expect(telemetry).toHaveProperty('uptimeSeconds');

      // Queues
      expect(telemetry.queues.pdf.waiting).toBe(2);
      expect(telemetry.queues.pdf.status).toBe('healthy');
      expect(telemetry.queues.status).toBe('healthy');

      // WebSockets
      expect(telemetry.websockets.connectedClients).toBe(3);
      expect(telemetry.websockets.status).toBe('online');

      // Storage
      expect(telemetry.storage.totalFiles).toBe(25);
      expect(telemetry.storage.clamAvStatus).toBe('active');

      // Security
      expect(telemetry.security.throttledRequestsLastHour).toBe(5);
      expect(telemetry.security.blockedIpsCount).toBe(2);
      expect(telemetry.security.firewallStatus).toBe('active');
    });

    it('debe manejar fallos de BullMQ con valores de contingencia saludables', async () => {
      pdfQueueMock.getJobCounts.mockRejectedValue(new Error('BullMQ connection failure'));

      const telemetry = await service.getSystemTelemetry();
      expect(telemetry.queues.pdf.waiting).toBe(0);
      expect(telemetry.queues.status).toBe('healthy');
    });
  });
});

