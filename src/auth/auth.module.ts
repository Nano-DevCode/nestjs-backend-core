import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SessionService } from './session.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard, RolesGuard, PermissionsGuard } from './guards';
import { MailModule } from '../mail/mail.module';
import { TwoFactorModule } from '../two-factor/two-factor.module';

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
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    JwtStrategy,
    JwtAuthGuard,
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
    PassportModule,
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    PasswordService,
    AuthTokenService,
    EmailVerificationService,
  ],
})
export class AuthModule {}
