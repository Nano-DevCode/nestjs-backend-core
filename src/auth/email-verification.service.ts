import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { REDIS_CLIENT } from '../redis/redis.constants';

@Injectable()
export class EmailVerificationService {
  private readonly tokenTtlSeconds = 86400; // 24 horas

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async generateAndSendToken(user: {
    id: string;
    email: string;
    name?: string | null;
  }): Promise<void> {
    const verificationToken = crypto.randomBytes(32).toString('hex');

    await this.redis
      .pipeline()
      .set(
        `auth:verify-email:${verificationToken}`,
        user.id,
        'EX',
        this.tokenTtlSeconds,
      )
      .set(
        `auth:user-verify-token:${user.id}`,
        verificationToken,
        'EX',
        this.tokenTtlSeconds,
      )
      .exec();

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const verificationUrl = `${appUrl}/auth/verify-email?token=${verificationToken}`;

    await this.mailService.sendVerificationEmail({
      to: user.email,
      name: user.name ?? undefined,
      verificationToken,
      verificationUrl,
    });
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const userId = await this.redis.getdel(`auth:verify-email:${token}`);
    if (!userId) {
      throw new BadRequestException(
        'El token de verificación es inválido o ha expirado',
      );
    }

    // Limpia la clave de mapeo inverso de Redis
    await this.redis.del(`auth:user-verify-token:${userId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true, deletedAt: true },
    });

    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new BadRequestException('Usuario no válido o dado de baja');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });

    return {
      message:
        'Correo electrónico verificado exitosamente. Ya puedes iniciar sesión.',
    };
  }

  async resendVerificationEmail(email: string): Promise<{ message: string }> {
    const genericResponse = {
      message:
        'Si la cuenta existe y no está verificada, se ha enviado un nuevo enlace de confirmación.',
    };

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        deletedAt: true,
        emailVerifiedAt: true,
      },
    });

    // Si no existe, está inactivo, dado de baja o ya verificado, retorna mensaje genérico
    if (
      !user ||
      !user.isActive ||
      user.deletedAt !== null ||
      user.emailVerifiedAt !== null
    ) {
      return genericResponse;
    }

    // Invalidar token anterior en Redis si existía
    const existingToken = await this.redis.get(
      `auth:user-verify-token:${user.id}`,
    );
    if (existingToken) {
      await this.redis.del(`auth:verify-email:${existingToken}`);
    }

    await this.generateAndSendToken(user);

    return genericResponse;
  }
}
