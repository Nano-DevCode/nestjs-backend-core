import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { TwoFactorService } from './two-factor.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { DeviceTrustService } from './device-trust.service';
import { TwoFactorCryptoService } from './two-factor-crypto.service';
import { generateSecret, generateSync } from 'otplib';

describe('TwoFactorService', () => {
  let service: TwoFactorService;
  let prismaMock: {
    userTwoFactor: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let redisMock: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
  };
  let deviceTrustServiceMock: {
    isDeviceTrusted: jest.Mock;
    registerTrustedDevice: jest.Mock;
  };
  let cryptoServiceMock: {
    encrypt: jest.Mock;
    decrypt: jest.Mock;
  };

  beforeEach(async () => {
    prismaMock = {
      userTwoFactor: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    redisMock = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(1),
    };

    deviceTrustServiceMock = {
      isDeviceTrusted: jest.fn(),
      registerTrustedDevice: jest.fn(),
    };

    cryptoServiceMock = {
      encrypt: jest.fn().mockImplementation((val) => `encrypted:${val}`),
      decrypt: jest.fn().mockImplementation((val) => {
        if (typeof val === 'string' && val.startsWith('encrypted:')) {
          return val.replace('encrypted:', '');
        }
        return val;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: REDIS_CLIENT, useValue: redisMock },
        { provide: DeviceTrustService, useValue: deviceTrustServiceMock },
        { provide: TwoFactorCryptoService, useValue: cryptoServiceMock },
      ],
    }).compile();

    service = module.get<TwoFactorService>(TwoFactorService);
  });

  describe('generateSecret', () => {
    it('debe generar secreto, guardarlo en Redis temporalmente y retornar QR y URI', async () => {
      const result = await service.generateSecret('user-1', 'test@example.com');

      expect(result).toHaveProperty('otpauthUrl');
      expect(result).toHaveProperty('qrCodeDataUrl');
      expect(redisMock.set).toHaveBeenCalledWith(
        '2fa:temp:user-1',
        expect.any(String),
        'EX',
        600,
      );
    });
  });

  describe('enableTwoFactor', () => {
    it('debe lanzar BadRequestException si no existe secreto temporal en Redis', async () => {
      redisMock.get.mockResolvedValue(null);

      await expect(
        service.enableTwoFactor('user-1', '123456'),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar BadRequestException si el código TOTP es inválido', async () => {
      const secret = generateSecret();
      redisMock.get.mockResolvedValue(secret);

      await expect(
        service.enableTwoFactor('user-1', '000000'),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe cifrar el secreto, persistirlo en base de datos y eliminar la clave temporal de Redis con código válido', async () => {
      const secret = generateSecret();
      const validCode = generateSync({ secret });
      redisMock.get.mockResolvedValue(secret);

      const res = await service.enableTwoFactor('user-1', validCode);

      expect(cryptoServiceMock.encrypt).toHaveBeenCalledWith(secret);
      expect(prismaMock.userTwoFactor.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          create: expect.objectContaining({ isEnabled: true }),
        }),
      );
      expect(redisMock.del).toHaveBeenCalledWith('2fa:temp:user-1');
      expect(res.message).toBeDefined();
    });
  });

  describe('disableTwoFactor', () => {
    it('debe lanzar BadRequestException si 2FA no está habilitado en Prisma', async () => {
      prismaMock.userTwoFactor.findUnique.mockResolvedValue(null);

      await expect(
        service.disableTwoFactor('user-1', '123456'),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe verificar código TOTP válido y actualizar isEnabled a false', async () => {
      const secret = generateSecret();
      const validCode = generateSync({ secret });

      prismaMock.userTwoFactor.findUnique.mockResolvedValue({
        id: '2fa-id',
        userId: 'user-1',
        secret: `encrypted:${secret}`,
        isEnabled: true,
      });

      const res = await service.disableTwoFactor('user-1', validCode);

      expect(prismaMock.userTwoFactor.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { isEnabled: false },
      });
      expect(res.message).toBeDefined();
    });
  });

  describe('createPendingChallenge y verifyPendingChallenge', () => {
    it('debe crear un token de reto con TTL en Redis', async () => {
      const token = await service.createPendingChallenge('user-1', true);

      expect(token).toBeDefined();
      expect(redisMock.set).toHaveBeenCalledWith(
        `2fa:pending:${token}`,
        JSON.stringify({ userId: 'user-1', trustDevice: true }),
        'EX',
        300,
      );
    });

    it('debe lanzar UnauthorizedException si el reto no existe o expiró', async () => {
      redisMock.get.mockResolvedValue(null);

      await expect(
        service.verifyPendingChallenge('expired-token', '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debe validar exitosamente el reto 2FA y consumirlo de Redis', async () => {
      const secret = generateSecret();
      const validCode = generateSync({ secret });

      redisMock.get.mockResolvedValue(
        JSON.stringify({ userId: 'user-1', trustDevice: false }),
      );
      prismaMock.userTwoFactor.findUnique.mockResolvedValue({
        id: '2fa-id',
        userId: 'user-1',
        secret: `encrypted:${secret}`,
        isEnabled: true,
      });

      const challenge = await service.verifyPendingChallenge(
        'valid-token',
        validCode,
      );

      expect(challenge.userId).toBe('user-1');
      expect(redisMock.del).toHaveBeenCalledWith('2fa:pending:valid-token');
    });
  });

  describe('verifyActionCode', () => {
    it('debe retornar true cuando el código TOTP coincide con el secreto del usuario', async () => {
      const secret = generateSecret();
      const validCode = generateSync({ secret });

      prismaMock.userTwoFactor.findUnique.mockResolvedValue({
        id: '2fa-id',
        userId: 'user-1',
        secret: `encrypted:${secret}`,
        isEnabled: true,
      });

      const isValid = await service.verifyActionCode('user-1', validCode);
      expect(isValid).toBe(true);
    });

    it('debe retornar false si el usuario no tiene 2FA habilitado', async () => {
      prismaMock.userTwoFactor.findUnique.mockResolvedValue(null);

      const isValid = await service.verifyActionCode('user-1', '123456');
      expect(isValid).toBe(false);
    });
  });

  describe('isTwoFactorEnabled', () => {
    it('debe retornar true si el registro existe y isEnabled es true', async () => {
      prismaMock.userTwoFactor.findUnique.mockResolvedValue({
        isEnabled: true,
      });

      const enabled = await service.isTwoFactorEnabled('user-1');
      expect(enabled).toBe(true);
    });

    it('debe retornar false si no existe registro', async () => {
      prismaMock.userTwoFactor.findUnique.mockResolvedValue(null);

      const enabled = await service.isTwoFactorEnabled('user-1');
      expect(enabled).toBe(false);
    });
  });
});

