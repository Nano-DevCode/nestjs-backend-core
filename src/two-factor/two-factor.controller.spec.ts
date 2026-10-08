import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { TwoFactorController } from './two-factor.controller';
import { TwoFactorService } from './two-factor.service';
import { AuthService } from '../auth/auth.service';
import type { Request, Response } from 'express';

describe('TwoFactorController', () => {
  let controller: TwoFactorController;
  let twoFactorServiceMock: {
    isTwoFactorEnabled: jest.Mock;
    generateSecret: jest.Mock;
    enableTwoFactor: jest.Mock;
    disableTwoFactor: jest.Mock;
    verifyPendingChallenge: jest.Mock;
  };
  let authServiceMock: {
    complete2FALogin: jest.Mock;
  };

  const mockReq = {
    user: { id: 'user-1', email: 'test@example.com' },
    cookies: {},
  } as unknown as Request & { user: { id: string; email: string } };

  const mockRes = {
    clearCookie: jest.fn(),
  } as unknown as Response;

  beforeEach(async () => {
    twoFactorServiceMock = {
      isTwoFactorEnabled: jest.fn().mockResolvedValue(true),
      generateSecret: jest.fn().mockResolvedValue({
        otpauthUrl: 'otpauth://...',
        qrCodeDataUrl: 'data:image/png;base64,...',
      }),
      enableTwoFactor: jest.fn().mockResolvedValue({
        message: 'Autenticación en dos pasos habilitada exitosamente.',
      }),
      disableTwoFactor: jest.fn().mockResolvedValue({
        message: 'Autenticación en dos pasos deshabilitada exitosamente.',
      }),
      verifyPendingChallenge: jest.fn().mockResolvedValue({
        userId: 'user-1',
        trustDevice: false,
      }),
    };

    authServiceMock = {
      complete2FALogin: jest.fn().mockResolvedValue({
        accessToken: 'mock-access-token',
        user: { id: 'user-1', email: 'test@example.com' },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TwoFactorController],
      providers: [
        { provide: TwoFactorService, useValue: twoFactorServiceMock },
        { provide: AuthService, useValue: authServiceMock },
      ],
    }).compile();

    controller = module.get<TwoFactorController>(TwoFactorController);
  });

  describe('getStatus', () => {
    it('debe retornar el estado de 2FA del usuario autenticado', async () => {
      const result = await controller.getStatus(mockReq);
      expect(result).toEqual({ isEnabled: true });
      expect(twoFactorServiceMock.isTwoFactorEnabled).toHaveBeenCalledWith(
        'user-1',
      );
    });
  });

  describe('generate', () => {
    it('debe invocar generateSecret con el id y email del usuario', async () => {
      const result = await controller.generate(mockReq);
      expect(result).toHaveProperty('otpauthUrl');
      expect(twoFactorServiceMock.generateSecret).toHaveBeenCalledWith(
        'user-1',
        'test@example.com',
      );
    });
  });

  describe('turnOn', () => {
    it('debe habilitar 2FA enviando el código proporcionado', async () => {
      const result = await controller.turnOn(mockReq, { code: '123456' });
      expect(twoFactorServiceMock.enableTwoFactor).toHaveBeenCalledWith(
        'user-1',
        '123456',
      );
      expect(result.message).toBeDefined();
    });
  });

  describe('turnOff', () => {
    it('debe deshabilitar 2FA enviando el código proporcionado', async () => {
      const result = await controller.turnOff(mockReq, { code: '123456' });
      expect(twoFactorServiceMock.disableTwoFactor).toHaveBeenCalledWith(
        'user-1',
        '123456',
      );
      expect(result.message).toBeDefined();
    });
  });

  describe('authenticate', () => {
    it('debe lanzar UnauthorizedException si no hay tempToken en body ni en cookies', async () => {
      const reqWithoutToken = { cookies: {} } as Request;

      await expect(
        controller.authenticate(reqWithoutToken, { code: '123456' }, mockRes),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debe verificar reto, limpiar cookie y completar login satisfactoriamente', async () => {
      const reqWithToken = {
        cookies: { temp_2fa_token: 'cookie-temp-token' },
      } as Request;

      const result = await controller.authenticate(
        reqWithToken,
        { code: '123456' },
        mockRes,
      );

      expect(twoFactorServiceMock.verifyPendingChallenge).toHaveBeenCalledWith(
        'cookie-temp-token',
        '123456',
      );
      expect(mockRes.clearCookie).toHaveBeenCalledWith(
        'temp_2fa_token',
        expect.any(Object),
      );
      expect(authServiceMock.complete2FALogin).toHaveBeenCalledWith(
        'user-1',
        mockRes,
        false,
      );
      expect(result).toHaveProperty('accessToken');
    });
  });
});

