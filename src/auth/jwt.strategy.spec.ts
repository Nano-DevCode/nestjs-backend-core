import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy, JwtPayload } from './jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from './session.service';
import type { Request } from 'express';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prismaMock: { user: { findUnique: jest.Mock } };
  let sessionServiceMock: {
    isTokenBlacklisted: jest.Mock;
    getCachedUserAuthContext: jest.Mock;
    cacheUserAuthContext: jest.Mock;
  };

  const mockReq = {
    headers: { authorization: 'Bearer header.payload.mockSignature' },
    cookies: {},
  } as unknown as Request;

  const mockPayload: JwtPayload = {
    sub: 'user-123',
    email: 'test@example.com',
    jti: 'jti-valid',
  };

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
      },
    };

    sessionServiceMock = {
      isTokenBlacklisted: jest.fn().mockResolvedValue(false),
      getCachedUserAuthContext: jest.fn().mockResolvedValue(null),
      cacheUserAuthContext: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SessionService, useValue: sessionServiceMock },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  describe('validate', () => {
    it('debe lanzar UnauthorizedException si el jti está en lista negra', async () => {
      sessionServiceMock.isTokenBlacklisted.mockResolvedValueOnce(true);

      await expect(strategy.validate(mockReq, mockPayload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debe lanzar UnauthorizedException si la firma del token está en lista negra', async () => {
      sessionServiceMock.isTokenBlacklisted
        .mockResolvedValueOnce(false) // jti no blacklisted
        .mockResolvedValueOnce(true); // firma blacklisted

      await expect(strategy.validate(mockReq, mockPayload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debe retornar el contexto cacheado en Redis si existe (omite consulta a base de datos)', async () => {
      const cachedContext = {
        id: 'user-123',
        email: 'test@example.com',
        roles: ['user'],
        permissions: ['read:data'],
        isTwoFactorEnabled: false,
      };
      sessionServiceMock.getCachedUserAuthContext.mockResolvedValue(cachedContext);

      const result = await strategy.validate(mockReq, mockPayload);

      expect(result).toEqual(cachedContext);
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it('debe consultar base de datos y cachear si el contexto no estaba en Redis', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        isActive: true,
        deletedAt: null,
        emailVerifiedAt: new Date(),
        twoFactor: { isEnabled: false },
        roles: [
          {
            role: {
              name: 'admin',
              permissions: [{ permission: { slug: 'manage:all' } }],
            },
          },
        ],
      });

      const result = await strategy.validate(mockReq, mockPayload);

      expect(result.id).toBe('user-123');
      expect(result.roles).toContain('admin');
      expect(result.permissions).toContain('manage:all');
      expect(sessionServiceMock.cacheUserAuthContext).toHaveBeenCalledWith(
        'user-123',
        expect.any(Object),
        60,
      );
    });

    it('debe lanzar UnauthorizedException si el usuario está inactivo o borrado', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-123',
        isActive: false,
        deletedAt: null,
        emailVerifiedAt: new Date(),
      });

      await expect(strategy.validate(mockReq, mockPayload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debe lanzar UnauthorizedException si el usuario no tiene correo verificado', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-123',
        isActive: true,
        deletedAt: null,
        emailVerifiedAt: null,
      });

      await expect(strategy.validate(mockReq, mockPayload)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
