import { Global, Module, OnApplicationShutdown, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisClientProvider } from './redis.provider';
import { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
  providers: [RedisClientProvider],
  exports: [RedisClientProvider],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) {}

  async onApplicationShutdown() {
    await this.redisClient.quit();
  }
}
