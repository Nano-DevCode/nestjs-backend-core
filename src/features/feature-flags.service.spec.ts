import { Test, TestingModule } from '@nestjs/testing';
import { FeatureFlagsService } from './feature-flags.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';

describe('FeatureFlagsService', () => {
  let service: FeatureFlagsService;
  let mockPrisma: {
    featureFlag: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let mockRedis: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      featureFlag: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        findMany: jest.fn(),
      },
    };

    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureFlagsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<FeatureFlagsService>(FeatureFlagsService);
  });

  it('debe leer flag habilitado desde Redis sin consultar Prisma', async () => {
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({ isEnabled: true }));

    const result = await service.isFeatureEnabled('BETA_FEATURE');

    expect(result).toBe(true);
    expect(mockRedis.get).toHaveBeenCalledWith('feature_flag:BETA_FEATURE');
    expect(mockPrisma.featureFlag.findUnique).not.toHaveBeenCalled();
  });

  it('debe consultar Prisma y cachear en Redis si no está en caché', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    mockPrisma.featureFlag.findUnique.mockResolvedValueOnce({
      isEnabled: true,
      rules: null,
    });

    const result = await service.isFeatureEnabled('NEW_CHECKOUT');

    expect(result).toBe(true);
    expect(mockPrisma.featureFlag.findUnique).toHaveBeenCalledWith({
      where: { key: 'NEW_CHECKOUT' },
      select: { isEnabled: true, rules: true },
    });
    expect(mockRedis.set).toHaveBeenCalledWith(
      'feature_flag:NEW_CHECKOUT',
      JSON.stringify({ isEnabled: true, rules: null }),
      'EX',
      300,
    );
  });

  it('debe devolver false y cachear ausencia si la flag no existe en Prisma', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    mockPrisma.featureFlag.findUnique.mockResolvedValueOnce(null);

    const result = await service.isFeatureEnabled('NON_EXISTENT');

    expect(result).toBe(false);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'feature_flag:NON_EXISTENT',
      JSON.stringify({ isEnabled: false }),
      'EX',
      60,
    );
  });

  it('debe evaluar reglas de usuario y permitir solo a usuarios en la lista', async () => {
    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({
        isEnabled: true,
        rules: { allowedUsers: ['user-123'] },
      }),
    );

    const allowed = await service.isFeatureEnabled('USER_SPECIFIC', {
      userId: 'user-123',
    });
    expect(allowed).toBe(true);

    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({
        isEnabled: true,
        rules: { allowedUsers: ['user-123'] },
      }),
    );

    const denied = await service.isFeatureEnabled('USER_SPECIFIC', {
      userId: 'user-999',
    });
    expect(denied).toBe(false);
  });

  it('debe habilitar un flag en Prisma y sincronizar Redis', async () => {
    mockPrisma.featureFlag.upsert.mockResolvedValueOnce({
      key: 'DARK_MODE',
      isEnabled: true,
      rules: null,
    });

    await service.enableFeature('DARK_MODE');

    expect(mockPrisma.featureFlag.upsert).toHaveBeenCalledWith({
      where: { key: 'DARK_MODE' },
      update: { isEnabled: true },
      create: { key: 'DARK_MODE', isEnabled: true },
    });
    expect(mockRedis.set).toHaveBeenCalledWith(
      'feature_flag:DARK_MODE',
      JSON.stringify({ isEnabled: true, rules: null }),
      'EX',
      300,
    );
  });

  it('debe deshabilitar un flag en Prisma y sincronizar Redis', async () => {
    mockPrisma.featureFlag.upsert.mockResolvedValueOnce({
      key: 'DARK_MODE',
      isEnabled: false,
      rules: null,
    });

    await service.disableFeature('DARK_MODE');

    expect(mockPrisma.featureFlag.upsert).toHaveBeenCalledWith({
      where: { key: 'DARK_MODE' },
      update: { isEnabled: false },
      create: { key: 'DARK_MODE', isEnabled: false },
    });
    expect(mockRedis.set).toHaveBeenCalledWith(
      'feature_flag:DARK_MODE',
      JSON.stringify({ isEnabled: false, rules: null }),
      'EX',
      300,
    );
  });
});
