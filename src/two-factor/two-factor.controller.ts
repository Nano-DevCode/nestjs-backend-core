import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  Inject,
  forwardRef,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { TwoFactorService } from './two-factor.service';
import { TwoFactorCodeDto } from './dto/two-factor-code.dto';
import { TwoFactorAuthDto } from './dto/two-factor-auth.dto';
import { Toggle2FADto } from './dto/toggle-2fa.dto';
import { AuthService } from '../auth/auth.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
} from '../common/scalar/scalar.decorators';

interface AuthenticatedUser {
  id: string;
  email: string;
}

interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@ApiTags('Two-Factor Authentication (2FA / MFA)')
@Controller('auth/2fa')
export class TwoFactorController {
  constructor(
    private readonly twoFactorService: TwoFactorService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) {}

  @Get('status')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('bearer-jwt')
  @ApiCookieAuth('cookie-jwt')
  @ApiOperation({
    summary: 'Consulta el estado de activación de 2FA del usuario autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado de 2FA obtenido exitosamente',
  })
  async getStatus(@Req() req: AuthenticatedRequest) {
    const isEnabled = await this.twoFactorService.isTwoFactorEnabled(
      req.user.id,
    );
    return { isEnabled };
  }

  @Post('generate')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('bearer-jwt')
  @ApiCookieAuth('cookie-jwt')
  @ApiOperation({
    summary: 'Genera el secreto TOTP y el código QR para vincular autenticador',
    description:
      'Devuelve el Data URI del QR y la clave secreta para Google Authenticator, Authy o 1Password.',
  })
  @ApiResponse({
    status: 200,
    description: 'Secreto TOTP y código QR generados exitosamente',
  })
  async generate(@Req() req: AuthenticatedRequest) {
    return this.twoFactorService.generateSecret(req.user.id, req.user.email);
  }

  @Post('turn-on')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('bearer-jwt')
  @ApiCookieAuth('cookie-jwt')
  @ApiOperation({
    summary: 'Confirma y activa 2FA verificando el primer código de 6 dígitos',
    description:
      'Cifra el secreto maestro con AES-256-GCM y genera 10 códigos de rescate de un solo uso.',
  })
  @ApiResponse({
    status: 200,
    description:
      '2FA habilitado con éxito. Devuelve los 10 códigos de recuperación.',
  })
  @ApiResponse({
    status: 400,
    description: 'Código TOTP de 6 dígitos incorrecto',
  })
  async turnOn(
    @Req() req: AuthenticatedRequest,
    @Body() dto: TwoFactorCodeDto,
  ) {
    return this.twoFactorService.enableTwoFactor(req.user.id, dto.code);
  }

  @Post('turn-off')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('bearer-jwt')
  @ApiCookieAuth('cookie-jwt')
  @ApiOperation({
    summary: 'Desactiva 2FA previa confirmación de código de seguridad',
  })
  @ApiResponse({
    status: 200,
    description: '2FA desactivado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Código de seguridad incorrecto',
  })
  async turnOff(@Req() req: AuthenticatedRequest, @Body() dto: Toggle2FADto) {
    return this.twoFactorService.disableTwoFactor(req.user.id, dto.code);
  }

  @Post('authenticate')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Resuelve el desafío 2FA durante el flujo de inicio de sesión',
    description:
      'Recibe el tempToken o lee la cookie temp_2fa_token y valida el código TOTP o código de recuperación.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Desafío 2FA resuelto satisfactoriamente. Establece sesión completa.',
  })
  @ApiResponse({
    status: 401,
    description: 'Código 2FA incorrecto o token de desafío expirado',
  })
  async authenticate(
    @Req() req: Request,
    @Body() dto: TwoFactorAuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = req.cookies as Record<string, string> | undefined;
    const tempToken = dto.tempToken || cookies?.['temp_2fa_token'];

    if (!tempToken) {
      throw new UnauthorizedException(
        'El identificador temporal 2FA es requerido o ha expirado.',
      );
    }

    const challenge = await this.twoFactorService.verifyPendingChallenge(
      tempToken,
      dto.code,
    );

    // Limpiar cookie temporal 2FA tras autenticación satisfactoria
    res.clearCookie('temp_2fa_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return this.authService.complete2FALogin(
      challenge.userId,
      res,
      challenge.trustDevice,
    );
  }
}
