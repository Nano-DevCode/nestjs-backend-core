import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SessionService } from './session.service';
import type {
  UserAuthContext,
  UserAuthResponse,
} from './interfaces/auth.interface';

export const AUTH_COOKIE_OPTIONS = {
  getAccessTokenOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutos
      path: '/',
    };
  },
  getRefreshTokenOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
      path: '/api/auth', // Permite enviar la cookie con prefijo global 'api' a /api/auth/refresh y /api/auth/logout
    };
  },
};

@Injectable()
export class AuthTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly sessionService: SessionService,
  ) {}

  generateTokens(
    user: UserAuthContext,
    tokenId: string,
  ): { accessToken: string; refreshToken: string } {
    const jti = uuidv4();
    const payload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
      jti,
    };

    const jwtSecret = process.env.JWT_SECRET;
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    if (
      (!jwtSecret || !refreshSecret) &&
      process.env.NODE_ENV === 'production'
    ) {
      throw new Error(
        'FATAL: JWT_SECRET o JWT_REFRESH_SECRET no están configurados en producción.',
      );
    }

    const accessToken = this.jwtService.sign(payload, {
      secret: jwtSecret || 'super_secret_jwt_key',
      expiresIn: '15m',
      algorithm: 'HS256',
    });

    const refreshToken = this.jwtService.sign(
      { sub: user.id, tokenId },
      {
        secret: refreshSecret || 'super_refresh_jwt_key',
        expiresIn: '7d',
        algorithm: 'HS256',
      },
    );

    return { accessToken, refreshToken };
  }

  async createSessionAndCookies(
    user: UserAuthContext,
    res: Response,
    existingTokenId?: string,
  ): Promise<UserAuthResponse> {
    const tokenId = existingTokenId || uuidv4();
    const { accessToken, refreshToken } = this.generateTokens(user, tokenId);

    if (!existingTokenId) {
      await this.sessionService.setSession(user.id, tokenId, 604800);
    }

    res.cookie(
      'access_token',
      accessToken,
      AUTH_COOKIE_OPTIONS.getAccessTokenOptions(),
    );
    res.cookie(
      'refresh_token',
      refreshToken,
      AUTH_COOKIE_OPTIONS.getRefreshTokenOptions(),
    );

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles,
        permissions: user.permissions,
        isTwoFactorEnabled: user.isTwoFactorEnabled,
      },
    };
  }

  clearAuthCookies(res: Response): void {
    const getClearOpts = (opts: CookieOptions): CookieOptions => {
      const clearOpts = { ...opts };
      delete clearOpts.maxAge;
      return clearOpts;
    };

    res.clearCookie(
      'access_token',
      getClearOpts(AUTH_COOKIE_OPTIONS.getAccessTokenOptions()),
    );
    res.clearCookie(
      'refresh_token',
      getClearOpts(AUTH_COOKIE_OPTIONS.getRefreshTokenOptions()),
    );
  }
}
