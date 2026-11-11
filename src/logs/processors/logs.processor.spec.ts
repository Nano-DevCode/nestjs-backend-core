import { Test, TestingModule } from '@nestjs/testing';
import { LogsProcessor } from './logs.processor';
import { PrismaService } from '../../prisma/prisma.service';
import { LogSource, LogLevel } from '../../../prisma/generated/prisma/client';

describe('LogsProcessor', () => {
  let processor: LogsProcessor;
  let prisma: {
    systemLog: {
      createMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      systemLog: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LogsProcessor, { provide: PrismaService, useValue: prisma }],
    }).compile();

    processor = module.get<LogsProcessor>(LogsProcessor);
  });

  it('debe estar definido', () => {
    expect(processor).toBeDefined();
  });

  it('debe omitir la inserción si el lote de logs está vacío', async () => {
    const mockJob = {
      id: 'job-1',
      data: { logs: [] },
    } as unknown as Parameters<typeof processor.process>[0];

    await processor.process(mockJob);

    expect(prisma.systemLog.createMany).not.toHaveBeenCalled();
  });

  it('debe mapear e insertar en lote los registros en PostgreSQL con createMany', async () => {
    const mockLogs = [
      {
        source: LogSource.BACKEND,
        level: LogLevel.ERROR,
        context: 'TestContext',
        message: 'Error en BD',
        stackTrace: 'Error: at line 1',
        metadata: { path: '/api/test' },
        userId: 'u1',
      },
      {
        source: LogSource.FRONTEND,
        level: LogLevel.WARN,
        context: 'ReactComponent',
        message: 'Render slow',
        userId: undefined,
      },
    ];

    const mockJob = {
      id: 'job-100',
      data: { logs: mockLogs },
    } as unknown as Parameters<typeof processor.process>[0];

    await processor.process(mockJob);

    expect(prisma.systemLog.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.systemLog.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          source: LogSource.BACKEND,
          level: LogLevel.ERROR,
          context: 'TestContext',
          userId: 'u1',
        }),
        expect.objectContaining({
          source: LogSource.FRONTEND,
          level: LogLevel.WARN,
          context: 'ReactComponent',
          userId: null,
        }),
      ]),
    });
  });
});
