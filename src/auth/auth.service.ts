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
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import type {
  UserAuthContext,
  UserAuthResponse,
} from './interfaces/auth.interface';

export * from './interfaces/auth.interface';
export { AUTH_COOKIE_OPTIONS };

export const userAuthSelect = {
  id: true,
  email: true,
  name: true,
  isActive: true,
  deletedAt: true,
  emailVerifiedAt: true,
  profile: {
    select: {
      firstName: true,
      firstLastName: true,
      secondLastName: true,
      avatarUrl: true,
    },
  },
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
          priority: true,
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
  name: true,
  password: true,
  isActive: true,
  deletedAt: true,
  emailVerifiedAt: true,
  profile: {
    select: {
      firstName: true,
      firstLastName: true,
      secondLastName: true,
      avatarUrl: true,
    },
  },
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
          priority: true,
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

  buildUserAuthContext(
    user: UserAuthPayload | UserValidatePayload,
  ): UserAuthContext {
    const flatRoles: string[] = user.roles.map(
      (ur: UserRoleItem) => ur.role.name,
    );
    const permissionSlugs: string[] = user.roles.flatMap((ur: UserRoleItem) =>
      ur.role.permissions.map((rp: RolePermissionItem) => rp.permission.slug),
    );

    const isTwoFactorEnabled: boolean = Boolean(user.twoFactor?.isEnabled);
    const highestPriority = Math.max(
      ...user.roles.map((ur: UserRoleItem) => ur.role.priority ?? 0),
      0,
    );

    const isProfileComplete = Boolean(
      user.profile?.firstName?.trim() &&
        user.profile?.firstLastName?.trim() &&
        user.profile?.secondLastName?.trim(),
    );

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: flatRoles,
      permissions: Array.from(new Set(permissionSlugs)),
      isTwoFactorEnabled,
      priority: highestPriority,
      isProfileComplete,
    };
  }

  async register(
    dtoOrEmail: RegisterDto | string,
    pass?: string,
    legacyName?: string,
  ) {
    let email: string;
    let passToValidate: string;
    let firstName: string;
    let firstLastName: string;
    let secondLastName: string;
    let fullName: string;

    if (typeof dtoOrEmail === 'object') {
      email = dtoOrEmail.email;
      passToValidate = dtoOrEmail.password;
      firstName = dtoOrEmail.firstName?.trim() || '';
      firstLastName = dtoOrEmail.firstLastName?.trim() || '';
      secondLastName = dtoOrEmail.secondLastName?.trim() || '';
      fullName =
        dtoOrEmail.name?.trim() ||
        `${firstName} ${firstLastName} ${secondLastName}`.trim();
    } else {
      email = dtoOrEmail;
      passToValidate = pass!;
      const parts = (legacyName || '').trim().split(/\s+/);
      firstName = parts[0] || '';
      firstLastName = parts[1] || '';
      secondLastName = parts.slice(2).join(' ') || '';
      fullName =
        legacyName ||
        `${firstName} ${firstLastName} ${secondLastName}`.trim();
    }

    this.passwordService.validatePasswordStrength(passToValidate);

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

    const hashedPassword = await this.passwordService.hash(passToValidate);

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: fullName || null,
        profile: {
          create: {
            firstName: firstName || null,
            firstLastName: firstLastName || null,
            secondLastName: secondLastName || null,
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

    return this.buildUserAuthContext(user);
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

    return this.buildUserAuthContext(user);
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserAuthContext> {
    const firstName = dto.firstName.trim();
    const firstLastName = dto.firstLastName.trim();
    const secondLastName = dto.secondLastName.trim();
    const fullName = `${firstName} ${firstLastName} ${secondLastName}`;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: fullName,
        profile: {
          upsert: {
            create: {
              firstName,
              firstLastName,
              secondLastName,
              bio: dto.bio?.trim(),
              avatarUrl: dto.avatarUrl?.trim(),
            },
            update: {
              firstName,
              firstLastName,
              secondLastName,
              ...(dto.bio !== undefined && { bio: dto.bio?.trim() }),
              ...(dto.avatarUrl !== undefined && {
                avatarUrl: dto.avatarUrl?.trim(),
              }),
            },
          },

        },
      },
      select: userAuthSelect,
    });

    const authContext = this.buildUserAuthContext(user);
    await this.sessionService.cacheUserAuthContext(userId, authContext, 60);

    return authContext;
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
