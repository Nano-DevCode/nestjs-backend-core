import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtMobileStrategy } from './jwt-mobile.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../session.service';
import type { Request } from 'express';
import type { JwtPayload } from '../jwt.strategy';

describe('JwtMobileStrategy', () => {
  let strategy: JwtMobileStrategy;
  let sessionService: {
    isTokenBlacklisted: jest.Mock;
    getCachedUserAuthContext: jest.Mock;
    cacheUserAuthContext: jest.Mock;
  };
  let prismaService: {
    user: {
      findUnique: jest.Mock;
    };
  };

  const mockPayload: JwtPayload = {
    sub: 'user-123',
    email: 'test@example.com',
    jti: 'jti-abc-123',
  };

  const mockRequest = {
    headers: {
      authorization: 'Bearer header.payload.validsignature',
    },
  } as unknown as Request;

  beforeEach(async () => {
    sessionService = {
      isTokenBlacklisted: jest.fn().mockResolvedValue(false),
      getCachedUserAuthContext: jest.fn().mockResolvedValue(null),
      cacheUserAuthContext: jest.fn().mockResolvedValue(undefined),
    };

    prismaService = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-123',
          email: 'test@example.com',
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
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtMobileStrategy,
        { provide: PrismaService, useValue: prismaService },
        { provide: SessionService, useValue: sessionService },
      ],
    }).compile();

    strategy = module.get<JwtMobileStrategy>(JwtMobileStrategy);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  it('should throw UnauthorizedException if jti is blacklisted', async () => {
    sessionService.isTokenBlacklisted.mockImplementation((id: string) => {
      return Promise.resolve(id === 'jti-abc-123');
    });

    await expect(strategy.validate(mockRequest, mockPayload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException if bearer token signature is blacklisted', async () => {
    sessionService.isTokenBlacklisted.mockImplementation((id: string) => {
      return Promise.resolve(id === 'validsignature');
    });

    await expect(strategy.validate(mockRequest, mockPayload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should return cached context without querying database if present', async () => {
    const cachedContext = {
      id: 'user-123',
      email: 'test@example.com',
      roles: ['user'],
      permissions: ['read:profile'],
      isTwoFactorEnabled: false,
    };
    sessionService.getCachedUserAuthContext.mockResolvedValue(cachedContext);

    const result = await strategy.validate(mockRequest, mockPayload);

    expect(result).toEqual(cachedContext);
    expect(prismaService.user.findUnique).not.toHaveBeenCalled();
  });

  it('should query Prisma, cache context, and return UserAuthContext when cache misses', async () => {
    const result = await strategy.validate(mockRequest, mockPayload);

    expect(result).toEqual({
      id: 'user-123',
      email: 'test@example.com',
      name: undefined,
      roles: ['user'],
      permissions: ['read:profile'],
      isTwoFactorEnabled: false,
      isProfileComplete: false,
    });

    expect(prismaService.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      select: expect.any(Object),
    });
    expect(sessionService.cacheUserAuthContext).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({ id: 'user-123' }),
      60,
    );
  });

  it('should throw UnauthorizedException if user does not exist or is inactive', async () => {
    prismaService.user.findUnique.mockResolvedValue(null);

    await expect(strategy.validate(mockRequest, mockPayload)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
