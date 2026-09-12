import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { RequireFeature } from './features/decorators/require-feature.decorator';
import { FeatureFlagGuard } from './features/guards/feature-flag.guard';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('beta-feature')
  @RequireFeature('BETA_FEATURE')
  @UseGuards(FeatureFlagGuard)
  getBetaFeature(): { ok: boolean } {
    return { ok: true };
  }
}
