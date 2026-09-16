import { Module, Global } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { FeatureFlagsService } from './feature-flags.service';
import { FeatureFlagGuard } from './guards/feature-flag.guard';
import { FeatureFlagsController } from './feature-flags.controller';

@Global()
@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService, FeatureFlagGuard],
  exports: [FeatureFlagsService, FeatureFlagGuard],
})
export class FeatureFlagsModule {}
