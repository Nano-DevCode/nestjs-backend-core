import { Module, Global } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { FeatureFlagsService } from './feature-flags.service';
import { FeatureFlagGuard } from './guards/feature-flag.guard';

@Global()
@Module({
  imports: [PrismaModule, RedisModule],
  providers: [FeatureFlagsService, FeatureFlagGuard],
  exports: [FeatureFlagsService, FeatureFlagGuard],
})
export class FeatureFlagsModule {}
