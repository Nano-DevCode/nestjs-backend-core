import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from './session.service';
import { PasswordService } from './password.service';
import { AuthTokenService } from './auth-token.service';
import { EmailVerificationService } from './email-verification.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import type { Response } from 'express';
import type { UserAuthContext } from './interfaces/auth.interface';

describe('AuthService', () => {
  let service: AuthService;
  let prismaMock: {
    user: { findUnique: jest.Mock; create: jest.Mock };
    role: { findFirst: jest.Mock };
  };
  let sessionServiceMock: {
    revokeSession: jest.Mock;
    blacklistToken: jest.Mock;
  };
  let passwordServiceMock: {
    validatePasswordStrength: jest.Mock;
    hash: jest.Mock;
    compare: jest.Mock;
    compareWithDummy: jest.Mock;
  };
  let authTokenServiceMock: {
    createSessionAndCookies: jest.Mock;
    clearAuthCookies: jest.Mock;
  };
  let emailVerificationServiceMock: {
    generateAndSendToken: jest.Mock;
  };
  let twoFactorServiceMock: {
    isDeviceTrusted: jest.Mock;
    createPendingChallenge: jest.Mock;
    registerTrustedDevice: jest.Mock;
  };

  const mockRes = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response;

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      role: {
        findFirst: jest.fn().mockResolvedValue({ id: 'role-user-id' }),
      },
    };

    sessionServiceMock = {
      revokeSession: jest.fn().mockResolvedValue(undefined),
      blacklistToken: jest.fn().mockResolvedValue(undefined),
    };

    passwordServiceMock = {
      validatePasswordStrength: jest.fn(),
      hash: jest.fn().mockResolvedValue('hashed-pass'),
      compare: jest.fn().mockResolvedValue(true),
      compareWithDummy: jest.fn().mockResolvedValue(false),
    };

    authTokenServiceMock = {
      createSessionAndCookies: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        user: { id: 'u-1', email: 'test@example.com' },
      }),
      clearAuthCookies: jest.fn(),
    };

    emailVerificationServiceMock = {
      generateAndSendToken: jest.fn().mockResolvedValue(undefined),
    };

    twoFactorServiceMock = {
      isDeviceTrusted: jest.fn().mockResolvedValue(false),
      createPendingChallenge: jest.fn().mockResolvedValue('temp-2fa-token'),
      registerTrustedDevice: jest.fn().mockResolvedValue('device-id'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SessionService, useValue: sessionServiceMock },
        { provide: PasswordService, useValue: passwordServiceMock },
        { provide: AuthTokenService, useValue: authTokenServiceMock },
        {
          provide: EmailVerificationService,
          useValue: emailVerificationServiceMock,
        },
        { provide: TwoFactorService, useValue: twoFactorServiceMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('debe lanzar BadRequestException si el email ya existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'existing-id' });

      await expect(
        service.register('existing@example.com', 'Pass12345'),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe crear el usuario y enviar email de verificación', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'new-user-id',
        email: 'new@example.com',
        name: 'New User',
      });

      const result = await service.register('new@example.com', 'Pass12345', 'New User');

      expect(passwordServiceMock.validatePasswordStrength).toHaveBeenCalledWith('Pass12345');
      expect(passwordServiceMock.hash).toHaveBeenCalledWith('Pass12345');
      expect(prismaMock.user.create).toHaveBeenCalled();
      expect(emailVerificationServiceMock.generateAndSendToken).toHaveBeenCalled();
      expect(result.user.id).toBe('new-user-id');
    });
  });

  describe('validateUser', () => {
    it('debe lanzar UnauthorizedException si las credenciales son inválidas', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      passwordServiceMock.compareWithDummy.mockResolvedValue(false);

      await expect(
        service.validateUser('unknown@example.com', 'wrong'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debe lanzar UnauthorizedException si el usuario no tiene email verificado', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'u1@example.com',
        password: 'hashed-password',
        isActive: true,
        deletedAt: null,
        emailVerifiedAt: null, // No verificado
        roles: [],
      });

      await expect(
        service.validateUser('u1@example.com', 'correct-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debe retornar UserAuthContext si las credenciales son válidas y está verificado', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'u1@example.com',
        password: 'hashed-password',
        isActive: true,
        deletedAt: null,
        emailVerifiedAt: new Date(),
        twoFactor: { isEnabled: false },
        roles: [
          {
            role: {
              name: 'user',
              permissions: [{ permission: { slug: 'read:profile' } }],
            },
          },
        ],
      });

      const user = await service.validateUser('u1@example.com', 'correct-password');

      expect(user.id).toBe('u-1');
      expect(user.roles).toContain('user');
      expect(user.permissions).toContain('read:profile');
    });
  });

  describe('login', () => {
    const mockUserContext: UserAuthContext = {
      id: 'u-1',
      email: 'user@example.com',
      roles: ['user'],
      permissions: [],
      isTwoFactorEnabled: false,
    };

    it('debe iniciar sesión directamente si 2FA no está activo', async () => {
      const res = await service.login(mockUserContext, mockRes);

      expect(authTokenServiceMock.createSessionAndCookies).toHaveBeenCalled();
      expect(res).toHaveProperty('accessToken');
    });

    it('debe solicitar reto 2FA si está activo y el dispositivo no es confiable', async () => {
      const user2Fa: UserAuthContext = { ...mockUserContext, isTwoFactorEnabled: true };

      const res = await service.login(user2Fa, mockRes);

      expect(twoFactorServiceMock.createPendingChallenge).toHaveBeenCalled();
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'temp_2fa_token',
        'temp-2fa-token',
        expect.any(Object),
      );
      expect(res).toEqual({ require2FA: true, tempToken: 'temp-2fa-token' });
    });
  });

  describe('logout', () => {
    it('debe revocar sesión en Redis, poner token en blacklist y limpiar cookies', async () => {
      const res = await service.logout(
        'u-1',
        'tok-1',
        mockRes,
        'jti-signature',
        900,
      );

      expect(sessionServiceMock.revokeSession).toHaveBeenCalledWith('u-1', 'tok-1');
      expect(sessionServiceMock.blacklistToken).toHaveBeenCalledWith('jti-signature', 900);
      expect(authTokenServiceMock.clearAuthCookies).toHaveBeenCalledWith(mockRes);
      expect(res.message).toBeDefined();
    });
  });
});
