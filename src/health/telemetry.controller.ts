import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '../common/scalar/scalar.decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/auth.decorator';
import { TelemetryService } from './telemetry.service';
import type { SystemTelemetryDto } from './dto/telemetry.dto';

@ApiTags('Telemetry & Observability')
@ApiBearerAuth('bearer-jwt')
@Controller('system')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Get('telemetry')
  @Roles('admin', 'superadmin')
  @ApiOperation({
    summary:
      'Obtiene la telemetría operativa en tiempo real del sistema (BullMQ, WebSockets, SeaweedFS y Seguridad/Throttling)',
  })
  @ApiResponse({
    status: 200,
    description: 'Métricas operativas del sistema obtenidas exitosamente',
  })
  async getTelemetry(): Promise<SystemTelemetryDto> {
    return this.telemetryService.getSystemTelemetry();
  }
}
