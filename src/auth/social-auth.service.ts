import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Prisma } from '../../prisma/generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthTokenService, AUTH_COOKIE_OPTIONS } from './auth-token.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import type { OAuthUserProfile } from './interfaces/oauth-user-profile.interface';
import {
  userAuthSelect,
  type UserAuthContext,
  type UserAuthPayload,
  type UserRoleItem,
  type RolePermissionItem,
} from './auth.service';

@Injectable()
export class SocialAuthService {
  private readonly logger = new Logger(SocialAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authTokenService: AuthTokenService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  async handleOAuthCallback(
    profile: OAuthUserProfile,
    res: Response,
    req?: Request,
  ): Promise<void> {
    // 1. Resolver lista de orígenes permitidos
    const configuredOrigins = [
      ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : []),
      ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
      'https://sistema.nano-service.com',
      'http://localhost:5173',
      'http://localhost:3000',
    ]
      .map((url) => url.trim().replace(/\/+$/, ''))
      .filter(Boolean);

    const isDev = process.env.NODE_ENV !== 'production';
    const defaultWebUrl = isDev
      ? configuredOrigins.find((o) => o.includes(':5173') || o.includes('localhost')) || 'http://localhost:5173'
      : configuredOrigins.find((o) => !o.includes('localhost')) || 'https://sistema.nano-service.com';

    let targetFrontendUrl = defaultWebUrl;
    let mobileRedirectUri: string | null = null;

    if (req?.query?.['state'] && typeof req.query['state'] === 'string') {
      try {
        const decoded = JSON.parse(
          Buffer.from(req.query['state'], 'base64url').toString('utf8'),
        );
        if (
          decoded?.platform === 'mobile' ||
          (decoded?.redirectUri && typeof decoded.redirectUri === 'string' && !decoded.redirectUri.startsWith('http'))
        ) {
          mobileRedirectUri = decoded.redirectUri;
        } else if (
          decoded?.redirectUri &&
          typeof decoded.redirectUri === 'string' &&
          decoded.redirectUri.startsWith('http')
        ) {
          const cleanUrl = decoded.redirectUri.trim().replace(/\/+$/, '');
          const isAllowed =
            configuredOrigins.some((origin) => cleanUrl.startsWith(origin)) ||
            (isDev && cleanUrl.includes('localhost'));
          if (isAllowed) {
            targetFrontendUrl = cleanUrl;
          }
        }
      } catch {
        // Ignorar si el state no es un JSON base64url
      }
    }

    try {
      // 1. Validar presencia del email
      if (!profile.email || typeof profile.email !== 'string') {
        if (profile.provider === 'facebook') {
          throw new BadRequestException(
            'Tu cuenta de Facebook no tiene un correo electrónico asociado. Por favor, asocia un correo en tu cuenta de Facebook e inténtalo de nuevo.',
          );
        }
        throw new BadRequestException(
          `El proveedor ${profile.provider} no devolvió una dirección de correo electrónico válida.`,
        );
      }

      const email = profile.email.toLowerCase().trim();

      // 2. Buscar si la cuenta federada ya está vinculada en OAuthAccount
      const existingOAuth = await this.prisma.oAuthAccount.findUnique({
        where: {
          provider_providerId: {
            provider: profile.provider,
            providerId: profile.providerId,
          },
        },
        include: {
          user: {
            select: userAuthSelect,
          },
        },
      });

      let targetUser: UserAuthPayload;

      if (existingOAuth?.user) {
        targetUser = existingOAuth.user;

        // Actualizar avatar en Profile si no estaba establecido o cambió
        if (profile.avatarUrl) {
          const lastParts = (profile.lastName || '').trim().split(/\s+/);
          const firstLastName = lastParts[0] || null;
          const secondLastName = lastParts.slice(1).join(' ') || null;

          await this.prisma.profile.upsert({
            where: { userId: targetUser.id },
            create: {
              userId: targetUser.id,
              firstName: profile.firstName,
              firstLastName,
              secondLastName,
              avatarUrl: profile.avatarUrl,
            },
            update: {
              avatarUrl: profile.avatarUrl,
            },
          });

        }
      } else {
        // 3. Buscar usuario por email para Account Linking Seguro
        const existingUser = await this.prisma.user.findUnique({
          where: { email },
          select: userAuthSelect,
        });

        if (existingUser) {
          // Si el usuario ya existe con este email, validar que el proveedor certifique el email
          if (!profile.emailVerified) {
            throw new BadRequestException(
              `No es posible vincular la cuenta automáticamente: el correo provisto por ${profile.provider} no está verificado.`,
            );
          }

          // Crear vínculo en OAuthAccount
          await this.prisma.oAuthAccount.create({
            data: {
              userId: existingUser.id,
              provider: profile.provider,
              providerId: profile.providerId,
              profileData: (profile.rawProfile ?? {}) as Prisma.InputJsonValue,
            },
          });

          const lastParts = (profile.lastName || '').trim().split(/\s+/);
          const firstLastName = lastParts[0] || null;
          const secondLastName = lastParts.slice(1).join(' ') || null;

          // Asegurar o actualizar el Profile del usuario
          await this.prisma.profile.upsert({
            where: { userId: existingUser.id },
            create: {
              userId: existingUser.id,
              firstName: profile.firstName,
              firstLastName,
              secondLastName,
              avatarUrl: profile.avatarUrl,
            },
            update: {
              avatarUrl: profile.avatarUrl || undefined,
            },
          });

          targetUser = existingUser;
          this.logger.log(
            `Cuenta ${profile.provider} vinculada exitosamente al usuario existente (${email})`,
          );
        } else {
          // 4. Registro de nuevo usuario (User + Profile + OAuthAccount)
          const defaultRole = await this.prisma.role.findFirst({
            where: { name: 'user' },
          });

          const lastParts = (profile.lastName || '').trim().split(/\s+/);
          const firstLastName = lastParts[0] || null;
          const secondLastName = lastParts.slice(1).join(' ') || null;

          const fullName =
            `${profile.firstName || ''} ${profile.lastName || ''}`.trim() ||
            email.split('@')[0];

          targetUser = await this.prisma.user.create({
            data: {
              email,
              name: fullName,
              password: null, // Usuarios federados sin contraseña local
              isActive: true,
              emailVerifiedAt: profile.emailVerified ? new Date() : null,
              profile: {
                create: {
                  firstName: profile.firstName,
                  firstLastName,
                  secondLastName,
                  avatarUrl: profile.avatarUrl,
                },
              },

              oauthAccounts: {
                create: {
                  provider: profile.provider,
                  providerId: profile.providerId,
                  profileData: (profile.rawProfile ??
                    {}) as Prisma.InputJsonValue,
                },
              },
              roles: defaultRole
                ? {
                    create: {
                      roleId: defaultRole.id,
                    },
                  }
                : undefined,
            },
            select: userAuthSelect,
          });

          this.logger.log(
            `Nuevo usuario registrado vía ${profile.provider} (${email}) con Profile y OAuthAccount asociados.`,
          );
        }
      }

      // Validar estado de la cuenta
      if (!targetUser.isActive || targetUser.deletedAt !== null) {
        throw new UnauthorizedException(
          'Tu cuenta está inactiva o ha sido dada de baja.',
        );
      }

      // 5. Manejo del Flujo 2FA Seguro
      if (targetUser.twoFactor?.isEnabled) {
        const tempToken = await this.twoFactorService.createPendingChallenge(
          targetUser.id,
          false,
        );

        if (mobileRedirectUri) {
          const sep = mobileRedirectUri.includes('?') ? '&' : '?';
          return res.redirect(
            `${mobileRedirectUri}${sep}require2FA=true&tempToken=${encodeURIComponent(tempToken)}`,
          );
        }

        // Emitir cookie temporal HttpOnly con SameSite=Lax (Web)
        res.cookie(
          'temp_2fa_token',
          tempToken,
          AUTH_COOKIE_OPTIONS.getTemp2FaTokenOptions(),
        );

        // Redirigir a login requiriendo 2FA (cero exposición de tokens en URL)
        return res.redirect(`${targetFrontendUrl}/login?require2FA=true`);
      }

      // 6. Usuario sin 2FA: Crear sesión
      const flatRoles: string[] = targetUser.roles.map(
        (ur: UserRoleItem) => ur.role.name,
      );
      const permissionSlugs: string[] = targetUser.roles.flatMap(
        (ur: UserRoleItem) =>
          ur.role.permissions.map(
            (rp: RolePermissionItem) => rp.permission.slug,
          ),
      );

      const isProfileComplete = Boolean(
        targetUser.profile?.firstName?.trim() &&
          targetUser.profile?.firstLastName?.trim() &&
          targetUser.profile?.secondLastName?.trim(),
      );

      const authContext: UserAuthContext = {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
        roles: flatRoles,
        permissions: Array.from(new Set(permissionSlugs)),
        isTwoFactorEnabled: false,
        isProfileComplete,
      };


      if (mobileRedirectUri) {
        const mobileTokens =
          await this.authTokenService.createMobileTokens(authContext);
        const sep = mobileRedirectUri.includes('?') ? '&' : '?';
        const userParam = encodeURIComponent(
          JSON.stringify(mobileTokens.user),
        );
        return res.redirect(
          `${mobileRedirectUri}${sep}accessToken=${encodeURIComponent(mobileTokens.accessToken)}&refreshToken=${encodeURIComponent(mobileTokens.refreshToken)}&user=${userParam}`,
        );
      }

      await this.authTokenService.createSessionAndCookies(authContext, res);

      // Redirigir al frontend confirmando autenticación exitosa
      return res.redirect(`${targetFrontendUrl}/login?oauth=success`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Error de autenticación social';
      this.logger.error(
        `Fallo en autenticación OAuth (${profile.provider}): ${message}`,
      );
      if (mobileRedirectUri) {
        const sep = mobileRedirectUri.includes('?') ? '&' : '?';
        return res.redirect(
          `${mobileRedirectUri}${sep}error=${encodeURIComponent(message)}`,
        );
      }
      return res.redirect(
        `${targetFrontendUrl}/login?error=${encodeURIComponent(message)}`,
      );
    }
  }
}
