import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/auth.decorator';
import { IsOptional, IsBoolean, IsString } from 'class-validator';
import type { FeatureFlagRules } from './interfaces/feature-flags.interface';
import { FeatureFlagKey } from './constants/feature-flags.constant';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '../common/scalar/scalar.decorators';

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

@ApiTags('Feature Flags Management')
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  /**
   * Endpoint público para que el cliente frontend consulte qué banderas
   * de cara al usuario (como Google/Facebook OAuth) están activas.
   */
  @Get('public')
  @ApiOperation({
    summary: 'Consulta pública de banderas activas para interfaces de usuario',
    description:
      'Informa a los clientes web y móviles qué módulos opcionales están encendidos (Google/FB OAuth, Discord bot).',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado público de banderas de características',
  })
  async getPublicFlags() {
    const isMaster = await this.featureFlagsService.isFeatureEnabled(
      FeatureFlagKey.OAUTH_SOCIAL_LOGIN,
    );
    const isGoogle = await this.featureFlagsService.isFeatureEnabled(
      FeatureFlagKey.OAUTH_GOOGLE,
    );
    const isFacebook = await this.featureFlagsService.isFeatureEnabled(
      FeatureFlagKey.OAUTH_FACEBOOK,
    );
    const isDiscordBot = await this.featureFlagsService.isFeatureEnabled(
      FeatureFlagKey.DISCORD_BOT_ENABLED,
    );

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
  @ApiBearerAuth('bearer-jwt')
  @ApiOperation({
    summary: 'Lista el catálogo completo de banderas del sistema',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista completa de banderas con sus reglas y descripciones',
  })
  async getAllFlags() {
    return this.featureFlagsService.getAllFlags();
  }

  /**
   * Modificación de banderas en caliente (exclusivo para administradores)
   */
  @Patch(':key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  @ApiBearerAuth('bearer-jwt')
  @ApiOperation({
    summary: 'Modifica el estado o reglas de una bandera de funcionalidad en caliente',
  })
  @ApiParam({
    name: 'key',
    type: String,
    description: 'Identificador clave de la bandera (FeatureFlagKey)',
  })
  @ApiResponse({
    status: 200,
    description: 'Bandera de funcionalidad actualizada exitosamente',
  })
  @ApiResponse({
    status: 403,
    description: 'Requiere rol Administrador o Superadministrador',
  })
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
