/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
  };

  beforeEach(() => {
    redis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
    };
    interceptor = new IdempotencyInterceptor(redis as any);
  });

  function createMockContext(
    method: string,
    headers: Record<string, string>,
  ): ExecutionContext {
    const response = {
      statusCode: 200,
      status: jest.fn(),
    };
    return {
      switchToHttp: () => ({
        getRequest: () => ({ method, headers }),
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
  }

  it('should ignore GET requests even with idempotency header', async () => {
    const ctx = createMockContext('GET', { 'idempotency-key': 'req-123' });
    const next: CallHandler = { handle: () => of({ data: 'ok' }) };

    const observable = await interceptor.intercept(ctx, next);
    const result = await lastValueFrom(observable);

    expect(result).toEqual({ data: 'ok' });
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('should ignore POST requests without idempotency header', async () => {
    const ctx = createMockContext('POST', {});
    const next: CallHandler = { handle: () => of({ created: true }) };

    const observable = await interceptor.intercept(ctx, next);
    const result = await lastValueFrom(observable);

    expect(result).toEqual({ created: true });
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('should return cached response if key exists in Redis', async () => {
    const cachedData = {
      statusCode: 201,
      body: { id: 'item-123', status: 'completed' },
      cachedAt: new Date().toISOString(),
    };
    redis.get.mockResolvedValueOnce(JSON.stringify(cachedData));

    const ctx = createMockContext('POST', { 'idempotency-key': 'req-abc' });
    const next: CallHandler = { handle: jest.fn() };

    const observable = await interceptor.intercept(ctx, next);
    const result = await lastValueFrom(observable);

    expect(result).toEqual({ id: 'item-123', status: 'completed' });
    expect(redis.get).toHaveBeenCalledWith('idempotency:req-abc');
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('should process request and save in Redis when key does not exist in cache', async () => {
    redis.get.mockResolvedValueOnce(null);

    const ctx = createMockContext('POST', { 'Idempotency-Key': 'req-xyz' });
    const next: CallHandler = { handle: () => of({ success: true, id: 99 }) };

    const observable = await interceptor.intercept(ctx, next);
    const result = await lastValueFrom(observable);

    expect(result).toEqual({ success: true, id: 99 });
    expect(redis.get).toHaveBeenCalledWith('idempotency:req-xyz');
    expect(redis.set).toHaveBeenCalledWith(
      'idempotency:req-xyz',
      expect.stringContaining('"body":{"success":true,"id":99}'),
      'EX',
      86400,
    );
  });
});
