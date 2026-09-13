import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SessionService } from './session.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { MailModule } from '../mail/mail.module';
import { TwoFactorModule } from '../two-factor/two-factor.module';

import { MobileAuthController } from './mobile-auth.controller';
import { JwtMobileStrategy } from './strategies/jwt-mobile.strategy';
import { JwtMobileAuthGuard } from './guards/jwt-mobile-auth.guard';

import { PasswordService } from './password.service';
import { AuthTokenService } from './auth-token.service';
import { EmailVerificationService } from './email-verification.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    MailModule,
    forwardRef(() => TwoFactorModule),
  ],
  controllers: [AuthController, MobileAuthController],
  providers: [
    AuthService,
    SessionService,
    JwtStrategy,
    JwtAuthGuard,
    JwtMobileStrategy,
    JwtMobileAuthGuard,
    RolesGuard,
    PermissionsGuard,
    PasswordService,
    AuthTokenService,
    EmailVerificationService,
  ],
  exports: [
    AuthService,
    SessionService,
    JwtStrategy,
    JwtAuthGuard,
    JwtMobileStrategy,
    JwtMobileAuthGuard,
    PassportModule,
    RolesGuard,
    PermissionsGuard,
    PasswordService,
    AuthTokenService,
    EmailVerificationService,
  ],
})
export class AuthModule {}
