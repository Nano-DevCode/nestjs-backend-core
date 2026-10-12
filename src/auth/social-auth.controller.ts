import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import { FacebookOAuthGuard } from './guards/facebook-oauth.guard';
import { SocialAuthService } from './social-auth.service';
import type { OAuthUserProfile } from './interfaces/oauth-user-profile.interface';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '../common/scalar/scalar.decorators';

interface RequestWithOAuthUser extends Request {
  user: OAuthUserProfile;
}

@ApiTags('Auth Social & OAuth2')
@Controller('auth')
export class SocialAuthController {
  constructor(private readonly socialAuthService: SocialAuthService) {}

  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({
    summary: 'Inicia el flujo de autenticación federada con Google',
    description:
      'Redirige al usuario al consentimiento de Google OAuth2 para solicitar acceso a perfil y correo.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirección al proveedor de identidad de Google',
  })
  async googleAuth() {
    // Redirige al consent screen de Google mediante GoogleOAuthGuard
  }

  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({
    summary: 'Callback de respuesta de Google OAuth2',
    description:
      'Procesa el código de autorización devuelto por Google, reconcilia la cuenta del usuario e inicia sesión.',
  })
  @ApiResponse({
    status: 302,
    description:
      'Redirección al frontend con cookies de sesión o parámetros de éxito',
  })
  async googleAuthCallback(
    @Req() req: RequestWithOAuthUser,
    @Res() res: Response,
  ) {
    return this.socialAuthService.handleOAuthCallback(req.user, res, req);
  }

  @Get('facebook')
  @UseGuards(FacebookOAuthGuard)
  @ApiOperation({
    summary: 'Inicia el flujo de autenticación federada con Facebook',
    description:
      'Redirige al usuario a la pantalla de consentimiento de Facebook para autenticación social.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirección al proveedor de identidad de Facebook',
  })
  async facebookAuth() {
    // Redirige a la pantalla de consentimiento de Facebook mediante FacebookOAuthGuard
  }

  @Get('facebook/callback')
  @UseGuards(FacebookOAuthGuard)
  @ApiOperation({
    summary: 'Callback de respuesta de Facebook OAuth2',
    description:
      'Procesa el retorno de Facebook, valida el correo verificado e inicia la sesión en el sistema.',
  })
  @ApiResponse({
    status: 302,
    description:
      'Redirección al frontend con cookies de sesión o parámetros de éxito',
  })
  async facebookAuthCallback(
    @Req() req: RequestWithOAuthUser,
    @Res() res: Response,
  ) {
    return this.socialAuthService.handleOAuthCallback(req.user, res, req);
  }
}
