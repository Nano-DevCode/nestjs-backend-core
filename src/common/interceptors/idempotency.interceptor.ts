import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 horas

interface CachedResponse {
  statusCode: number;
  body: unknown;
  cachedAt: string;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const method = request.method?.toUpperCase();

    // Solo aplica a mutaciones críticas (POST, PATCH, PUT)
    if (method !== 'POST' && method !== 'PATCH' && method !== 'PUT') {
      return next.handle();
    }

    const rawKey =
      request.headers[IDEMPOTENCY_HEADER] ||
      request.headers['Idempotency-Key'] ||
      request.headers['idempotency-key'];

    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (!key || typeof key !== 'string' || key.trim() === '') {
      return next.handle();
    }

    const redisKey = `idempotency:${key.trim()}`;

    try {
      const cached = await this.redis.get(redisKey);
      if (cached) {
        this.logger.log(
          `Retornando respuesta idempotente en caché para la clave: ${key}`,
        );
        const parsed = JSON.parse(cached) as CachedResponse;
        const response = http.getResponse<Response>();
        if (response && typeof response.status === 'function') {
          response.status(parsed.statusCode || 200);
        }
        return of(parsed.body);
      }
    } catch (err) {
      this.logger.warn(
        `Error al consultar clave de idempotencia en Redis: ${(err as Error).message}`,
      );
    }

    return next.handle().pipe(
      tap((responseBody: unknown) => {
        void (async () => {
          try {
            const res = http.getResponse<Response>();
            const cacheData: CachedResponse = {
              statusCode: res?.statusCode || 200,
              body: responseBody,
              cachedAt: new Date().toISOString(),
            };
            await this.redis.set(
              redisKey,
              JSON.stringify(cacheData),
              'EX',
              IDEMPOTENCY_TTL_SECONDS,
            );
          } catch (err) {
            this.logger.error(
              `Error al persistir resultado idempotente en Redis: ${(err as Error).message}`,
            );
          }
        })();
      }),
    );
  }
}
