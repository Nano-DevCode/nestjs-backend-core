import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { TestAlertDto } from './dto/test-alert.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/auth.decorator';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '../common/scalar/scalar.decorators';

@ApiTags('Alerts')
@ApiBearerAuth('bearer-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post('test')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Envía una alerta de prueba a los webhooks de monitoreo (Discord / Slack)' })
  @ApiResponse({ status: 200, description: 'Alerta procesada exitosamente' })
  async sendTestAlert(@Body() dto: TestAlertDto): Promise<{ success: boolean; message: string }> {
    const dispatched = await this.alertsService.sendAlert({
      title: dto.title,
      message: dto.message,
      severity: dto.severity || 'info',
      source: dto.source || 'Admin Test Panel',
      details: dto.details,
    });

    return {
      success: dispatched,
      message: dispatched
        ? 'Alerta despachada correctamente a los canales configurados'
        : 'Alerta procesada localmente (sin webhooks de Discord/Slack configurados en variables de entorno)',
    };
  }
}

