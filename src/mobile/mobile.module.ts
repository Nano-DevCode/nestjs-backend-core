import { Module } from '@nestjs/common';
import { MobileConfigController } from './controllers/mobile-config.controller';
import { MobileConfigService } from './services/mobile-config.service';

@Module({
  controllers: [MobileConfigController],
  providers: [MobileConfigService],
  exports: [MobileConfigService],
})
export class MobileModule {}
