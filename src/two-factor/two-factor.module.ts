import { Module, forwardRef } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TwoFactorService } from './two-factor.service';
import { TwoFactorController } from './two-factor.controller';
import { TwoFactorGuard } from './guards/two-factor.guard';
import { DeviceTrustService } from './device-trust.service';
import { TwoFactorCryptoService } from './two-factor-crypto.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    forwardRef(() => AuthModule),
  ],
  controllers: [TwoFactorController],
  providers: [
    TwoFactorService,
    TwoFactorGuard,
    DeviceTrustService,
    TwoFactorCryptoService,
  ],
  exports: [
    TwoFactorService,
    TwoFactorGuard,
    DeviceTrustService,
    TwoFactorCryptoService,
  ],
})
export class TwoFactorModule {}
