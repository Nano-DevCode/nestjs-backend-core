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

interface AuthenticatedUser {
  id: string;
  email: string;
}

interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Controller('auth/2fa')
export class TwoFactorController {
  constructor(
    private readonly twoFactorService: TwoFactorService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) {}

  @Get('status')
  @UseGuards(AuthGuard('jwt'))
  async getStatus(@Req() req: AuthenticatedRequest) {
    const isEnabled = await this.twoFactorService.isTwoFactorEnabled(
      req.user.id,
    );
    return { isEnabled };
  }

  @Post('generate')
  @UseGuards(AuthGuard('jwt'))
  async generate(@Req() req: AuthenticatedRequest) {
    return this.twoFactorService.generateSecret(req.user.id, req.user.email);
  }

  @Post('turn-on')
  @UseGuards(AuthGuard('jwt'))
  async turnOn(
    @Req() req: AuthenticatedRequest,
    @Body() dto: TwoFactorCodeDto,
  ) {
    return this.twoFactorService.enableTwoFactor(req.user.id, dto.code);
  }

  @Post('turn-off')
  @UseGuards(AuthGuard('jwt'))
  async turnOff(@Req() req: AuthenticatedRequest, @Body() dto: Toggle2FADto) {
    return this.twoFactorService.disableTwoFactor(req.user.id, dto.code);
  }

  @Post('authenticate')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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
