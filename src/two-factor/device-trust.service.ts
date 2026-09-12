import { Injectable, Inject } from '@nestjs/common';
import type { Response } from 'express';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { REDIS_CLIENT } from '../redis/redis.constants';

@Injectable()
export class DeviceTrustService {
  private readonly ttlSeconds = 30 * 24 * 60 * 60; // 30 días (2,592,000s)

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async isDeviceTrusted(userId: string, deviceId: string): Promise<boolean> {
    if (!deviceId) {
      return false;
    }
    const trustKey = `device:trust:${userId}:${deviceId}`;
    const exists = await this.redis.exists(trustKey);
    return exists === 1;
  }

  async registerTrustedDevice(userId: string, res: Response): Promise<string> {
    const deviceId = uuidv4();
    const trustKey = `device:trust:${userId}:${deviceId}`;

    await this.redis.set(trustKey, 'trusted', 'EX', this.ttlSeconds);

    res.cookie('trusted_device', deviceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: this.ttlSeconds * 1000,
      path: '/',
    });

    return deviceId;
  }
}
