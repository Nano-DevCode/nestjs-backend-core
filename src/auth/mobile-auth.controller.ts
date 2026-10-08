import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '../common/scalar/scalar.decorators';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { SessionService } from './session.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { JwtMobileAuthGuard } from './guards/jwt-mobile-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UserAuthContext } from './interfaces/auth.interface';
import {
  MobileLoginDto,
  MobileRefreshDto,
  MobileLogoutDto,
  Mobile2FaAuthDto,
} from './dto/mobile-auth.dto';

@ApiTags('Auth Mobile')
@Controller('auth/mobile')
export class MobileAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authTokenService: AuthTokenService,
    private readonly sessionService: SessionService,
    private readonly twoFactorService: TwoFactorService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Iniciar sesión para clientes móviles (sin cookies HTTP)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Autenticación exitosa (retorna tokens) o requerimiento de validación 2FA (retorna tempToken)',
  })
  async login(@Body() loginDto: MobileLoginDto) {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );

    if (user.isTwoFactorEnabled) {
      const tempToken = await this.twoFactorService.createPendingChallenge(
        user.id,
        false,
      );
      return {
        require2FA: true,
        tempToken,
      };
    }

    return this.authTokenService.createMobileTokens(user);
  }

  @Post('refresh')
  @ApiOperation({
    summary:
      'Renovar par de tokens mediante refresh token móvil en cuerpo JSON',
  })
  @ApiResponse({
    status: 200,
    description: 'Par de tokens renovados exitosamente con rotación atómica',
  })
  async refresh(@Body() refreshDto: MobileRefreshDto) {
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!refreshSecret && process.env.NODE_ENV === 'production') {
      throw new Error(
        'FATAL: JWT_REFRESH_SECRET no está configurado en producción.',
      );
    }

    let payload: { sub: string; tokenId: string };
    try {
      payload = this.jwtService.verify<{ sub: string; tokenId: string }>(
        refreshDto.refreshToken,
        {
          secret: refreshSecret || 'super_refresh_jwt_key',
          algorithms: ['HS256'],
        },
      );
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
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
      throw new UnauthorizedException('Reúso detectado. Sesiones invalidadas.');
    }

    const userContext = await this.authService.getUserAuthContextById(
      payload.sub,
    );

    return this.authTokenService.createMobileTokens(
      userContext,
      rotationResult.activeTokenId,
    );
  }

  @Post('logout')
  @UseGuards(JwtMobileAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Cerrar sesión móvil revocando Bearer token en Redis y sesión activa',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesión móvil invalidada exitosamente',
  })
  async logout(
    @CurrentUser() user: UserAuthContext,
    @Req() req: Request,
    @Body() logoutDto: MobileLogoutDto,
  ) {
    // 1. Invalidar token Bearer actual en la lista negra de Redis
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const rawAccessToken = authHeader.slice(7);
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

    // 2. Revocar sesión específica de refresh token si se proveyó, o todas las del usuario
    if (logoutDto?.refreshToken) {
      try {
        const payload = this.jwtService.verify<{ tokenId: string }>(
          logoutDto.refreshToken,
          {
            secret: process.env.JWT_REFRESH_SECRET || 'super_refresh_jwt_key',
            algorithms: ['HS256'],
          },
        );
        await this.sessionService.revokeSession(user.id, payload.tokenId);
      } catch {
        // Si el token es inválido o expiró, se continúa
      }
    } else {
      await this.sessionService.revokeAllUserSessions(user.id);
    }

    return { message: 'Sesión móvil cerrada exitosamente' };
  }

  @Post('2fa/authenticate')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Validar código TOTP 2FA y emitir tokens móviles definitivos (sin cookies)',
  })
  @ApiResponse({
    status: 200,
    description: 'Código 2FA válido, tokens móviles entregados',
  })
  async authenticate2FA(@Body() dto: Mobile2FaAuthDto) {
    const challenge = await this.twoFactorService.verifyPendingChallenge(
      dto.tempToken,
      dto.code,
    );

    const user = await this.authService.getUserAuthContextById(
      challenge.userId,
    );
    return this.authTokenService.createMobileTokens(user);
  }

  @Get('me')
  @UseGuards(JwtMobileAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obtener perfil del usuario autenticado en la app móvil',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil del usuario móvil obtenido exitosamente',
  })
  getProfile(@CurrentUser() user: UserAuthContext) {
    return {
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles,
        permissions: user.permissions,
        isTwoFactorEnabled: user.isTwoFactorEnabled,
      },
    };
  }
}
