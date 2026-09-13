import { Controller, Get, Query, Headers } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '../../common/scalar/scalar.decorators';
import { Public } from '../../auth/decorators/auth.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { MobileConfigService } from '../services/mobile-config.service';
import { VersionCheckDto, MobilePlatform } from '../dto/version-check.dto';

@ApiTags('Mobile Config')
@Controller('mobile')
export class MobileConfigController {
  constructor(private readonly mobileConfigService: MobileConfigService) {}

  @Get('version-check')
  @Public()
  @SkipThrottle()
  @ApiOperation({
    summary:
      'Verifica la versión de la app móvil y si requiere actualización obligatoria (Force Update)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Estado de compatibilidad de versión, políticas de actualización y enlace a la tienda',
  })
  checkVersion(
    @Query() query: VersionCheckDto,
    @Headers('x-platform') headerPlatform?: string,
    @Headers('x-app-version') headerVersion?: string,
  ) {
    let platform: MobilePlatform;
    if (query.platform) {
      platform = query.platform;
    } else if (headerPlatform?.toLowerCase() === 'ios') {
      platform = MobilePlatform.IOS;
    } else {
      platform = MobilePlatform.ANDROID;
    }

    const version = query.currentVersion || headerVersion || '1.0.0';

    return this.mobileConfigService.checkVersion(platform, version);
  }

  @Get('app-config')
  @Public()
  @SkipThrottle()
  @ApiOperation({
    summary: 'Obtiene parámetros públicos de configuración de la app móvil',
  })
  getAppConfig() {
    return this.mobileConfigService.getAppConfig();
  }
}
