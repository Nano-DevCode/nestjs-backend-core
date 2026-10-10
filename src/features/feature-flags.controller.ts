import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/auth.decorator';
import { IsOptional, IsBoolean, IsString } from 'class-validator';
import type { FeatureFlagRules } from './interfaces/feature-flags.interface';

export class UpdateFeatureFlagDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  rules?: FeatureFlagRules;
}

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
      (await this.featureFlagsService.isFeatureEnabled('OAUTH_SOCIAL_LOGIN')) ||
      (await this.featureFlagsService.isFeatureEnabled('oauth_social_login'));
    const isGoogle =
      (await this.featureFlagsService.isFeatureEnabled('OAUTH_GOOGLE')) ||
      (await this.featureFlagsService.isFeatureEnabled('oauth_google'));
    const isFacebook =
      (await this.featureFlagsService.isFeatureEnabled('OAUTH_FACEBOOK')) ||
      (await this.featureFlagsService.isFeatureEnabled('oauth_facebook'));
    const isDiscordBot =
      await this.featureFlagsService.isFeatureEnabled('DISCORD_BOT_ENABLED');

    return {
      oauth_social_login: isMaster,
      oauth_google: isMaster && isGoogle,
      oauth_facebook: isMaster && isFacebook,
      discord_bot: isDiscordBot,
    };
  }

  /**
   * Lista todas las banderas disponibles para usuarios autenticados
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async getAllFlags() {
    return this.featureFlagsService.getAllFlags();
  }

  /**
   * Modificación de banderas en caliente (exclusivo para administradores)
   */
  @Patch(':key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async toggleFlag(
    @Param('key') key: string,
    @Body() dto: UpdateFeatureFlagDto,
  ) {
    return this.featureFlagsService.setFeatureFlag(
      key,
      dto.isEnabled,
      dto.description,
      dto.rules,
    );
  }
}
