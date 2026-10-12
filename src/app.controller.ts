import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { RequireFeature } from './features/decorators/require-feature.decorator';
import { FeatureFlagGuard } from './features/guards/feature-flag.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from './common/scalar/scalar.decorators';

@ApiTags('Root & Core Status')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({
    summary: 'Endpoint raíz de bienvenida y comprobación básica de vida',
  })
  @ApiResponse({
    status: 200,
    description: 'Mensaje de saludo y estado del servicio',
  })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('beta-feature')
  @RequireFeature('BETA_FEATURE')
  @UseGuards(FeatureFlagGuard)
  @ApiOperation({
    summary: 'Endpoint de demostración protegido por Feature Flag BETA_FEATURE',
  })
  @ApiResponse({
    status: 200,
    description: 'Característica experimental habilitada',
  })
  @ApiResponse({
    status: 403,
    description: 'Característica deshabilitada por configuración',
  })
  getBetaFeature(): { ok: boolean } {
    return { ok: true };
  }
}
