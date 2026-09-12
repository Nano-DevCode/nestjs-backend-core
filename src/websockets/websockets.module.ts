import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { TwoFactorModule } from '../two-factor/two-factor.module';
import { FeatureFlagsModule } from '../features/feature-flags.module';
import { RedisModule } from '../redis/redis.module';
import {
  WsJwtGuard,
  WsRolesGuard,
  WsPermissionsGuard,
  WsTwoFactorGuard,
  WsFeatureFlagGuard,
} from './guards';
import { WsAllExceptionsFilter } from './filters';

import { EventsGateway } from './gateways/events.gateway';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super_secret_jwt_key',
    }),
    forwardRef(() => AuthModule),
    forwardRef(() => TwoFactorModule),
    FeatureFlagsModule,
    RedisModule,
  ],
  providers: [
    WsJwtGuard,
    WsRolesGuard,
    WsPermissionsGuard,
    WsTwoFactorGuard,
    WsFeatureFlagGuard,
    WsAllExceptionsFilter,
    EventsGateway,
  ],
  exports: [
    WsJwtGuard,
    WsRolesGuard,
    WsPermissionsGuard,
    WsTwoFactorGuard,
    WsFeatureFlagGuard,
    WsAllExceptionsFilter,
    EventsGateway,
  ],
})
export class WebsocketsModule {}
