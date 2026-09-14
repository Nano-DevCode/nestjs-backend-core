import {
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { ApiKeysService } from '../services/api-keys.service';
import type { ApiKeyRecord } from '../interfaces/api-key.interface';

describe('ApiKeyAuthGuard', () => {
  let guard: ApiKeyAuthGuard;
  let apiKeysService: {
    validateKey: jest.Mock;
  };
  let reflector: Reflector;

  const mockApiKey: ApiKeyRecord = {
    id: 'key-1',
    name: 'Partner Alpha',
    keyHash: 'hash123',
    keyPrefix: 'ak_live_12345678',
    scopes: ['students:read'],
    rateLimit: 60,
    isActive: true,
    expiresAt: null,
    lastUsedAt: null,
    createdAt: new Date(),
  };

  const createMockExecutionContext = (
    headers: Record<string, any> = {},
  ): ExecutionContext => {
    const request = {
      headers,
      apiKey: undefined as ApiKeyRecord | undefined,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    apiKeysService = {
      validateKey: jest.fn().mockResolvedValue(mockApiKey),
    };
    reflector = new Reflector();
    guard = new ApiKeyAuthGuard(
      apiKeysService as unknown as ApiKeysService,
      reflector,
    );
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should throw UnauthorizedException if X-API-Key header is missing', async () => {
    const context = createMockExecutionContext({});
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should allow access and attach apiKey when valid and no scopes are required', async () => {
    const context = createMockExecutionContext({
      'x-api-key': 'ak_live_abcdef1234567890',
    });

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(apiKeysService.validateKey).toHaveBeenCalledWith(
      'ak_live_abcdef1234567890',
    );
    expect(context.switchToHttp().getRequest().apiKey).toEqual(mockApiKey);
  });

  it('should allow access when apiKey has the required scope', async () => {
    const context = createMockExecutionContext({
      'x-api-key': 'ak_live_abcdef1234567890',
    });

    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['students:read']);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw ForbiddenException when apiKey lacks the required scope', async () => {
    const context = createMockExecutionContext({
      'x-api-key': 'ak_live_abcdef1234567890',
    });

    // Requiere scope 'grades:verify' que no está en mockApiKey.scopes
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['grades:verify']);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
