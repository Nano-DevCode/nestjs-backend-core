import { Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

export const RedisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: () => {
    const password = process.env.REDIS_PASSWORD;
    if (!password && process.env.NODE_ENV === 'production') {
      throw new Error(
        'FATAL: REDIS_PASSWORD no está definido en entorno de producción.',
      );
    }

    const client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: password || undefined,
      // Forzar protocolo RESP2 para evitar el handshake fallido de HELLO en Redis 7
      protocol: 2,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    client.on('connect', () => {
      console.log('✅ Conectado exitosamente a Redis');
    });

    client.on('error', (err: Error) => {
      console.error('❌ Error de conexión en Redis:', err.message);
    });

    return client;
  },
};
