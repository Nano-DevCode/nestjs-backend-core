import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
  Get,
  Query,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { Roles, RequirePermissions } from './decorators/auth.decorator';
import { PermissionsGuard } from './guards/permissions.guard';
import {
  RegisterDto,
  LoginDto,
  VerifyEmailDto,
  ResendVerificationDto,
} from './dto';
import { Throttle } from '@nestjs/throttler';
import { TwoFactorGuard } from '../two-factor/guards/two-factor.guard';
import { Require2FA } from '../two-factor/decorators/require-2fa.decorator';

interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  isTwoFactorEnabled?: boolean;
}

interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(
      registerDto.email,
      registerDto.password,
      registerDto.name,
    );
  }

  @Get('verify-email')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verifyEmail(@Query() query: VerifyEmailDto) {
    return this.authService.verifyEmail(query.token);
  }

  @Post('resend-verification')
  @Throttle({ default: { limit: 2, ttl: 60000 } })
  async resendVerification(@Body() resendDto: ResendVerificationDto) {
    return this.authService.resendVerificationEmail(resendDto.email);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
    const cookies = req.cookies as Record<string, string> | undefined;
    const trustedDeviceId = cookies?.['trusted_device'];

    return this.authService.login(
      user,
      res,
      undefined,
      trustedDeviceId,
      loginDto.trustDevice,
    );
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = req.cookies as Record<string, string> | undefined;
    const token = cookies?.['refresh_token'];
    if (!token) {
      throw new UnauthorizedException('Refresh token ausente');
    }

    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!refreshSecret && process.env.NODE_ENV === 'production') {
      throw new Error(
        'FATAL: JWT_REFRESH_SECRET no está configurado en producción.',
      );
    }

    let payload: { sub: string; tokenId: string };
    try {
      payload = this.jwtService.verify<{ sub: string; tokenId: string }>(
        token,
        {
          secret: refreshSecret || 'super_refresh_jwt_key',
          algorithms: ['HS256'],
        },
      );
    } catch {
      this.authService.clearAuthCookies(res);
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const newTokenId = uuidv4();
    const rotationResult = await this.sessionService.validateAndRotateToken(
      payload.sub,
      payload.tokenId,
      newTokenId,
      604800,
    );

    if (!rotationResult.success && rotationResult.isReuse) {
      await this.sessionService.revokeAllUserSessions(payload.sub);
      this.authService.clearAuthCookies(res);
      throw new UnauthorizedException('Reúso detectado. Sesiones invalidadas.');
    }

    const userContext = await this.authService.getUserAuthContextById(
      payload.sub,
    );
    return this.authService.login(
      userContext,
      res,
      rotationResult.activeTokenId,
    );
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = req.cookies as Record<string, string> | undefined;
    const refreshToken = cookies?.['refresh_token'];

    if (refreshToken) {
      try {
        const payload = this.jwtService.verify<{ tokenId: string }>(
          refreshToken,
          {
            secret: process.env.JWT_REFRESH_SECRET || 'super_refresh_jwt_key',
            algorithms: ['HS256'],
          },
        );
        await this.sessionService.revokeSession(req.user.id, payload.tokenId);
      } catch {
        // Token expirado o corrupto, se ignora el error de firma
      }
    } else {
      await this.sessionService.revokeAllUserSessions(req.user.id);
    }

    // Invalidar token de acceso actual en la lista negra de Redis
    const authHeader = req.headers.authorization;
    const rawAccessToken =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : cookies?.['access_token'];

    if (rawAccessToken) {
      try {
        const decoded: unknown = this.jwtService.decode(rawAccessToken);
        if (
          typeof decoded === 'object' &&
          decoded !== null &&
          !Array.isArray(decoded)
        ) {
          const payload = decoded as Record<string, unknown>;
          const jti =
            typeof payload['jti'] === 'string' ? payload['jti'] : undefined;
          const exp =
            typeof payload['exp'] === 'number' ? payload['exp'] : undefined;
          const now = Math.floor(Date.now() / 1000);
          const ttl = exp ? Math.max(1, exp - now) : 900;

          if (jti) {
            await this.sessionService.blacklistToken(jti, ttl);
          }
          const signature = rawAccessToken.split('.')[2];
          if (signature) {
            await this.sessionService.blacklistToken(signature, ttl);
          }
        }
      } catch {
        // Ignorar si no se puede decodificar
      }
    }

    this.authService.clearAuthCookies(res);

    return { message: 'Sesión cerrada exitosamente' };
  }

  @Get('admin-dashboard')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @Roles('admin')
  getAdminData(@Req() req: AuthenticatedRequest) {
    return { message: 'Acceso autorizado como administrador', user: req.user };
  }

  @Get('users-export')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermissions('users:export')
  exportUserData(@Req() req: AuthenticatedRequest) {
    return { message: 'Permiso users:export validado', user: req.user };
  }

  @Post('critical-action')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(AuthGuard('jwt'), TwoFactorGuard)
  @Require2FA()
  executeCriticalAction(@Req() req: AuthenticatedRequest) {
    return {
      message:
        'Acción crítica ejecutada exitosamente bajo validación Step-Up 2FA.',
      user: req.user,
    };
  }
}
