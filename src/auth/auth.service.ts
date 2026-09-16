import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Prisma } from '../../prisma/generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from './session.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { PasswordService } from './password.service';
import { AuthTokenService, AUTH_COOKIE_OPTIONS } from './auth-token.service';
import { EmailVerificationService } from './email-verification.service';
import type {
  UserAuthContext,
  UserAuthResponse,
} from './interfaces/auth.interface';

export * from './interfaces/auth.interface';
export { AUTH_COOKIE_OPTIONS };

export const userAuthSelect = {
  id: true,
  email: true,
  isActive: true,
  deletedAt: true,
  emailVerifiedAt: true,
  twoFactor: {
    select: {
      isEnabled: true,
    },
  },
  roles: {
    select: {
      role: {
        select: {
          name: true,
          permissions: {
            select: {
              permission: {
                select: { slug: true },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

export type UserAuthPayload = Prisma.UserGetPayload<{
  select: typeof userAuthSelect;
}>;

export type UserRoleItem = UserAuthPayload['roles'][number];
export type RolePermissionItem = UserRoleItem['role']['permissions'][number];

export const userValidateSelect = {
  id: true,
  email: true,
  password: true,
  isActive: true,
  deletedAt: true,
  emailVerifiedAt: true,
  twoFactor: {
    select: {
      isEnabled: true,
    },
  },
  roles: {
    select: {
      role: {
        select: {
          name: true,
          permissions: {
            select: {
              permission: {
                select: { slug: true },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

export type UserValidatePayload = Prisma.UserGetPayload<{
  select: typeof userValidateSelect;
}>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly passwordService: PasswordService,
    private readonly authTokenService: AuthTokenService,
    private readonly emailVerificationService: EmailVerificationService,
    @Inject(forwardRef(() => TwoFactorService))
    private readonly twoFactorService: TwoFactorService,
  ) {}

  async register(email: string, pass: string, name?: string) {
    this.passwordService.validatePasswordStrength(pass);

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('El usuario ya se encuentra registrado');
    }

    const defaultRole = await this.prisma.role.findFirst({
      where: { name: 'user' },
    });

    const hashedPassword = await this.passwordService.hash(pass);

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        roles: defaultRole
          ? {
              create: {
                roleId: defaultRole.id,
              },
            }
          : undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    await this.emailVerificationService.generateAndSendToken(user);

    return {
      message:
        'Usuario registrado exitosamente. Por favor verifica tu correo electrónico.',
      user,
    };
  }

  async validateUser(email: string, pass: string): Promise<UserAuthContext> {
    const user: UserValidatePayload | null = await this.prisma.user.findUnique({
      where: { email },
      select: userValidateSelect,
    });

    // Mitigación de Timing Attacks: se compara contra hash real o dummy
    const isPasswordValid =
      user && user.password
        ? await this.passwordService.compare(pass, user.password)
        : await this.passwordService.compareWithDummy(pass);

    if (!user || !isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.isActive || user.deletedAt !== null) {
      throw new UnauthorizedException('Usuario inactivo o dado de baja');
    }

    if (user.emailVerifiedAt === null) {
      throw new UnauthorizedException(
        'Debes confirmar tu correo electrónico antes de iniciar sesión',
      );
    }

    const flatRoles: string[] = user.roles.map(
      (ur: UserRoleItem) => ur.role.name,
    );
    const permissionSlugs: string[] = user.roles.flatMap((ur: UserRoleItem) =>
      ur.role.permissions.map((rp: RolePermissionItem) => rp.permission.slug),
    );

    const isTwoFactorEnabled: boolean = Boolean(user.twoFactor?.isEnabled);

    return {
      id: user.id,
      email: user.email,
      roles: flatRoles,
      permissions: Array.from(new Set(permissionSlugs)),
      isTwoFactorEnabled,
    };
  }

  async login(
    user: UserAuthContext,
    res: Response,
    existingTokenId?: string,
    trustedDeviceId?: string,
    trustDevice?: boolean,
  ): Promise<
    | UserAuthResponse
    | {
        require2FA: true;
        tempToken: string;
      }
  > {
    // Si el usuario tiene 2FA activado y no es una rotación de sesión ya autenticada (refresh)
    if (user.isTwoFactorEnabled && !existingTokenId) {
      const isTrusted = trustedDeviceId
        ? await this.twoFactorService.isDeviceTrusted(user.id, trustedDeviceId)
        : false;

      if (!isTrusted) {
        const tempToken = await this.twoFactorService.createPendingChallenge(
          user.id,
          !!trustDevice,
        );

        res.cookie(
          'temp_2fa_token',
          tempToken,
          AUTH_COOKIE_OPTIONS.getTemp2FaTokenOptions(),
        );

        return {
          require2FA: true,
          tempToken,
        };
      }
    }

    return this.authTokenService.createSessionAndCookies(
      user,
      res,
      existingTokenId,
    );
  }

  async complete2FALogin(
    userId: string,
    res: Response,
    trustDevice?: boolean,
  ): Promise<UserAuthResponse> {
    if (trustDevice) {
      await this.twoFactorService.registerTrustedDevice(userId, res);
    }

    const user = await this.getUserAuthContextById(userId);
    return this.authTokenService.createSessionAndCookies(user, res);
  }

  async getUserAuthContextById(userId: string): Promise<UserAuthContext> {
    const user: UserAuthPayload | null = await this.prisma.user.findUnique({
      where: { id: userId },
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

    const isTwoFactorEnabled: boolean = Boolean(user.twoFactor?.isEnabled);

    return {
      id: user.id,
      email: user.email,
      roles: flatRoles,
      permissions: Array.from(new Set(permissionSlugs)),
      isTwoFactorEnabled,
    };
  }

  clearAuthCookies(res: Response): void {
    this.authTokenService.clearAuthCookies(res);
  }

  async logout(
    userId: string,
    tokenId: string,
    res: Response,
    accessTokenJtiOrSignature?: string,
    ttlSeconds?: number,
  ) {
    await this.sessionService.revokeSession(userId, tokenId);
    if (accessTokenJtiOrSignature && ttlSeconds && ttlSeconds > 0) {
      await this.sessionService.blacklistToken(
        accessTokenJtiOrSignature,
        ttlSeconds,
      );
    }
    this.clearAuthCookies(res);
    return { message: 'Sesión finalizada correctamente' };
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    return this.emailVerificationService.verifyEmail(token);
  }

  async resendVerificationEmail(email: string): Promise<{ message: string }> {
    return this.emailVerificationService.resendVerificationEmail(email);
  }
}
