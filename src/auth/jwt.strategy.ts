import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import type { Prisma } from '../../prisma/generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { userAuthSelect } from './auth.service';
import type { UserRoleItem, RolePermissionItem } from './auth.service';
import type { UserAuthContext } from './interfaces/auth.interface';
import { SessionService } from './session.service';

export type JwtUserPayload = Prisma.UserGetPayload<{
  select: typeof userAuthSelect;
}>;

export interface JwtPayload {
  sub: string;
  email: string;
  roles?: string[];
  permissions?: string[];
  jti?: string;
  exp?: number;
  iat?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
  ) {
    const secret = process.env.JWT_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET no está configurado en producción.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request): string | null => {
          const cookies = req?.cookies as Record<string, string> | undefined;
          return cookies?.access_token ?? null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: secret || 'super_secret_jwt_key',
      algorithms: ['HS256'],
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<UserAuthContext> {
    // 1. Verificación de revocación por JTI en Redis
    if (payload.jti) {
      const isBlacklisted = await this.sessionService.isTokenBlacklisted(
        payload.jti,
      );
      if (isBlacklisted) {
        throw new UnauthorizedException(
          'Token revocado. Por favor, inicia sesión nuevamente.',
        );
      }
    }

    // 2. Verificación de revocación por firma del token en Redis
    const authHeader = req?.headers?.authorization;
    const cookies = req?.cookies as Record<string, string> | undefined;
    const rawToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : cookies?.['access_token'];

    if (rawToken) {
      const signature = rawToken.split('.')[2];
      if (
        signature &&
        (await this.sessionService.isTokenBlacklisted(signature))
      ) {
        throw new UnauthorizedException(
          'Token revocado. Por favor, inicia sesión nuevamente.',
        );
      }
    }

    const user: JwtUserPayload | null = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: userAuthSelect,
    });

    if (
      !user ||
      !user.isActive ||
      user.deletedAt !== null ||
      user.emailVerifiedAt === null
    ) {
      throw new UnauthorizedException(
        'Usuario inactivo, no verificado o dado de baja',
      );
    }

    const flatRoles: string[] = user.roles.map(
      (ur: UserRoleItem) => ur.role.name,
    );
    const permissionSlugs: string[] = user.roles.flatMap((ur: UserRoleItem) =>
      ur.role.permissions.map((rp: RolePermissionItem) => rp.permission.slug),
    );

    const isTwoFactorEnabled = Boolean(user.twoFactor?.isEnabled);

    return {
      id: user.id,
      email: user.email,
      roles: flatRoles,
      permissions: Array.from(new Set(permissionSlugs)),
      isTwoFactorEnabled,
    };
  }
}
