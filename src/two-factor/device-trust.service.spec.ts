import { Test, TestingModule } from '@nestjs/testing';
import { DeviceTrustService } from './device-trust.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import type { Response } from 'express';

describe('DeviceTrustService', () => {
  let service: DeviceTrustService;
  let redisMock: {
    exists: jest.Mock;
    set: jest.Mock;
  };

  beforeEach(async () => {
    redisMock = {
      exists: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceTrustService,
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    service = module.get<DeviceTrustService>(DeviceTrustService);
  });

  describe('isDeviceTrusted', () => {
    it('debe retornar false si deviceId está vacío o nulo', async () => {
      const result = await service.isDeviceTrusted('user-1', '');
      expect(result).toBe(false);
      expect(redisMock.exists).not.toHaveBeenCalled();
    });

    it('debe retornar true si el dispositivo está registrado en Redis', async () => {
      redisMock.exists.mockResolvedValue(1);
      const result = await service.isDeviceTrusted('user-1', 'dev-123');

      expect(redisMock.exists).toHaveBeenCalledWith('device:trust:user-1:dev-123');
      expect(result).toBe(true);
    });

    it('debe retornar false si el dispositivo no existe en Redis', async () => {
      redisMock.exists.mockResolvedValue(0);
      const result = await service.isDeviceTrusted('user-1', 'dev-456');

      expect(result).toBe(false);
    });
  });

  describe('registerTrustedDevice', () => {
    it('debe generar un deviceId, persistirlo en Redis por 30 días y configurar la cookie HTTP-Only', async () => {
      const mockRes = {
        cookie: jest.fn(),
      } as unknown as Response;

      const deviceId = await service.registerTrustedDevice('user-99', mockRes);

      expect(deviceId).toBeDefined();
      expect(redisMock.set).toHaveBeenCalledWith(
        `device:trust:user-99:${deviceId}`,
        'trusted',
        'EX',
        30 * 24 * 60 * 60,
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'trusted_device',
        deviceId,
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000,
        }),
      );
    });
  });
});

