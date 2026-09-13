import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import {
  userAuthSelect,
  UserRoleItem,
  RolePermissionItem,
} from '../auth.service';
import type { UserAuthContext } from '../interfaces/auth.interface';
import type { JwtPayload, JwtUserPayload } from '../jwt.strategy';
import { SessionService } from '../session.service';

@Injectable()
export class JwtMobileStrategy extends PassportStrategy(
  Strategy,
  'jwt-mobile',
) {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
  ) {
    const secret = process.env.JWT_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET no está configurado en producción.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret || 'super_secret_jwt_key',
      algorithms: ['HS256'],
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<UserAuthContext> {
    // 1. Verificación de revocación por JTI en lista negra de Redis
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

    // 2. Verificación de revocación por firma del token Bearer en Redis
    const authHeader = req?.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const rawToken = authHeader.slice(7);
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

    // 3. Verificación de contexto en caché Redis para evitar saturar la BD
    const cachedContext = await this.sessionService.getCachedUserAuthContext(
      payload.sub,
    );
    if (cachedContext) {
      return cachedContext;
    }

    // 4. Fallback a base de datos si expiró la caché
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

    const authContext: UserAuthContext = {
      id: user.id,
      email: user.email,
      roles: flatRoles,
      permissions: Array.from(new Set(permissionSlugs)),
      isTwoFactorEnabled,
    };

    // Almacenar en caché con TTL de 60 segundos
    await this.sessionService.cacheUserAuthContext(
      payload.sub,
      authContext,
      60,
    );

    return authContext;
  }
}
