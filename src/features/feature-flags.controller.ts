import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/auth.decorator';

@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  /**
   * Endpoint público para que el cliente frontend consulte qué banderas
   * de cara al usuario (como Google/Facebook OAuth) están activas.
   */
  @Get('public')
  async getPublicFlags() {
    const isMaster =
      await this.featureFlagsService.isFeatureEnabled('oauth_social_login');
    const isGoogle =
      await this.featureFlagsService.isFeatureEnabled('oauth_google');
    const isFacebook =
      await this.featureFlagsService.isFeatureEnabled('oauth_facebook');

    return {
      oauth_social_login: isMaster,
      oauth_google: isMaster && isGoogle,
      oauth_facebook: isMaster && isFacebook,
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async getAllFlags() {
    return this.featureFlagsService.getAllFlags();
  }

  @Patch(':key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async toggleFlag(
    @Param('key') key: string,
    @Body('isEnabled') isEnabled: boolean,
  ) {
    return this.featureFlagsService.setFeatureFlag(key, isEnabled);
  }
}
