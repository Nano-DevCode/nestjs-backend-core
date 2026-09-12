import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import type { Response } from 'express';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import type { Prisma } from '../../prisma/generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { DeviceTrustService } from './device-trust.service';
import { TwoFactorCryptoService } from './two-factor-crypto.service';

export interface PendingChallenge {
  userId: string;
  trustDevice: boolean;
}

export const twoFactorSelect = {
  id: true,
  userId: true,
  secret: true,
  isEnabled: true,
} satisfies Prisma.UserTwoFactorSelect;

export type TwoFactorPayload = Prisma.UserTwoFactorGetPayload<{
  select: typeof twoFactorSelect;
}>;

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly deviceTrustService: DeviceTrustService,
    private readonly cryptoService: TwoFactorCryptoService,
  ) {}

  async generateSecret(
    userId: string,
    email: string,
  ): Promise<{ otpauthUrl: string; qrCodeDataUrl: string }> {
    const secret = generateSecret();
    const tempKey = `2fa:temp:${userId}`;

    // Guarda el secreto temporalmente por 10 minutos (600 segundos)
    await this.redis.set(tempKey, secret, 'EX', 600);

    const issuer = process.env.APP_NAME || 'Sistema';
    const otpauthUrl = generateURI({
      secret,
      label: email,
      issuer,
    });

    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    return {
      otpauthUrl,
      qrCodeDataUrl,
    };
  }

  async enableTwoFactor(
    userId: string,
    code: string,
  ): Promise<{ message: string }> {
    const tempKey = `2fa:temp:${userId}`;
    const tempSecret = await this.redis.get(tempKey);

    if (!tempSecret) {
      throw new BadRequestException(
        'No hay una solicitud de configuración 2FA activa o ha expirado.',
      );
    }

    const secret: string = tempSecret;
    let isValid = false;
    try {
      const verification = verifySync({ token: code, secret });
      isValid = verification.valid;
    } catch {
      isValid = false;
    }

    if (!isValid) {
      throw new BadRequestException('Código 2FA inválido.');
    }

    const encryptedSecret = this.cryptoService.encrypt(tempSecret);

    await this.prisma.userTwoFactor.upsert({
      where: { userId },
      create: {
        userId,
        secret: encryptedSecret,
        isEnabled: true,
      },
      update: {
        secret: encryptedSecret,
        isEnabled: true,
      },
    });

    await this.redis.del(tempKey);

    return {
      message: 'Autenticación en dos pasos habilitada exitosamente.',
    };
  }

  async disableTwoFactor(
    userId: string,
    code: string,
  ): Promise<{ message: string }> {
    const record: TwoFactorPayload | null =
      await this.prisma.userTwoFactor.findUnique({
        where: { userId },
        select: twoFactorSelect,
      });

    if (!record || !record.isEnabled || !record.secret) {
      throw new BadRequestException(
        'La autenticación en dos pasos no está habilitada para esta cuenta.',
      );
    }

    const secret: string = this.cryptoService.decrypt(record.secret);
    let isValid = false;
    try {
      const verification = verifySync({
        token: code,
        secret,
      });
      isValid = verification.valid;
    } catch {
      isValid = false;
    }

    if (!isValid) {
      throw new BadRequestException('Código 2FA inválido.');
    }

    await this.prisma.userTwoFactor.update({
      where: { userId },
      data: {
        isEnabled: false,
      },
    });

    return {
      message: 'Autenticación en dos pasos deshabilitada exitosamente.',
    };
  }

  async isDeviceTrusted(userId: string, deviceId: string): Promise<boolean> {
    return this.deviceTrustService.isDeviceTrusted(userId, deviceId);
  }

  async registerTrustedDevice(userId: string, res: Response): Promise<string> {
    return this.deviceTrustService.registerTrustedDevice(userId, res);
  }

  async createPendingChallenge(
    userId: string,
    trustDevice: boolean,
  ): Promise<string> {
    const tempToken = crypto.randomBytes(32).toString('hex');
    const challengeKey = `2fa:pending:${tempToken}`;
    const data: PendingChallenge = { userId, trustDevice };

    // Expira en 5 minutos (300 segundos)
    await this.redis.set(challengeKey, JSON.stringify(data), 'EX', 300);

    return tempToken;
  }

  async verifyPendingChallenge(
    tempToken: string,
    code: string,
  ): Promise<PendingChallenge> {
    const challengeKey = `2fa:pending:${tempToken}`;
    const rawData = await this.redis.getdel(challengeKey);

    if (!rawData) {
      throw new UnauthorizedException('El reto 2FA es inválido o ha expirado.');
    }

    const challenge = JSON.parse(rawData) as PendingChallenge;

    const record: TwoFactorPayload | null =
      await this.prisma.userTwoFactor.findUnique({
        where: { userId: challenge.userId },
        select: twoFactorSelect,
      });

    if (!record || !record.isEnabled || !record.secret) {
      throw new UnauthorizedException(
        'La autenticación en dos pasos no está configurada para este usuario.',
      );
    }

    const secret: string = this.cryptoService.decrypt(record.secret);
    let isValid = false;
    try {
      const verification = verifySync({
        token: code,
        secret,
      });
      isValid = verification.valid;
    } catch {
      isValid = false;
    }

    if (!isValid) {
      throw new UnauthorizedException('Código 2FA incorrecto.');
    }

    return challenge;
  }

  async verifyActionCode(userId: string, code: string): Promise<boolean> {
    const record: TwoFactorPayload | null =
      await this.prisma.userTwoFactor.findUnique({
        where: { userId },
        select: twoFactorSelect,
      });

    if (!record || !record.isEnabled || !record.secret) {
      return false;
    }

    const secret: string = this.cryptoService.decrypt(record.secret);
    try {
      const verification = verifySync({
        token: code,
        secret,
      });
      return verification.valid;
    } catch {
      return false;
    }
  }

  async isTwoFactorEnabled(userId: string): Promise<boolean> {
    const record = await this.prisma.userTwoFactor.findUnique({
      where: { userId },
      select: { isEnabled: true },
    });
    return Boolean(record?.isEnabled);
  }
}
