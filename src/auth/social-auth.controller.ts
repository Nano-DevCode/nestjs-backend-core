import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import { FacebookOAuthGuard } from './guards/facebook-oauth.guard';
import { SocialAuthService } from './social-auth.service';
import type { OAuthUserProfile } from './interfaces/oauth-user-profile.interface';

interface RequestWithOAuthUser extends Request {
  user: OAuthUserProfile;
}

@Controller('auth')
export class SocialAuthController {
  constructor(private readonly socialAuthService: SocialAuthService) {}

  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  async googleAuth() {
    // Redirige al consent screen de Google mediante GoogleOAuthGuard
  }

  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  async googleAuthCallback(
    @Req() req: RequestWithOAuthUser,
    @Res() res: Response,
  ) {
    return this.socialAuthService.handleOAuthCallback(req.user, res, req);
  }

  @Get('facebook')
  @UseGuards(FacebookOAuthGuard)
  async facebookAuth() {
    // Redirige a la pantalla de consentimiento de Facebook mediante FacebookOAuthGuard
  }

  @Get('facebook/callback')
  @UseGuards(FacebookOAuthGuard)
  async facebookAuthCallback(
    @Req() req: RequestWithOAuthUser,
    @Res() res: Response,
  ) {
    return this.socialAuthService.handleOAuthCallback(req.user, res, req);
  }
}
