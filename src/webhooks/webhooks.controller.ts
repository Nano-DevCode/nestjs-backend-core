import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookSubscriptionDto } from './dto/create-webhook-subscription.dto';
import { DispatchWebhookTestDto } from './dto/dispatch-webhook-test.dto';
import type { WebhookSubscription } from './webhooks.interfaces';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/auth.decorator';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '../common/scalar/scalar.decorators';

@ApiTags('Outbound Webhooks')
@ApiBearerAuth('bearer-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('subscriptions')
  @Roles('admin', 'superadmin')
  @ApiOperation({ summary: 'Crea una nueva suscripción a webhooks salientes' })
  @ApiResponse({
    status: 201,
    description: 'Suscripción registrada exitosamente',
  })
  async createSubscription(
    @Body() dto: CreateWebhookSubscriptionDto,
  ): Promise<WebhookSubscription> {
    return this.webhooksService.registerSubscription(dto);
  }

  @Get('subscriptions')
  @Roles('admin', 'superadmin')
  @ApiOperation({ summary: 'Obtiene todas las suscripciones de webhooks' })
  @ApiResponse({ status: 200, description: 'Lista de suscripciones obtenida' })
  async listSubscriptions(): Promise<WebhookSubscription[]> {
    const subs = await this.webhooksService.listSubscriptions();
    return subs.map((sub) =>
      sub.secret
        ? { ...sub, secret: `${sub.secret.slice(0, 4)}****************` }
        : sub,
    );
  }

  @Get('subscriptions/:id')
  @Roles('admin', 'superadmin')
  @ApiOperation({
    summary: 'Obtiene el detalle de una suscripción de webhook por ID',
  })
  @ApiResponse({ status: 200, description: 'Detalle de la suscripción' })
  async getSubscription(@Param('id') id: string): Promise<WebhookSubscription> {
    const sub = await this.webhooksService.getSubscription(id);
    if (!sub) {
      throw new NotFoundException(
        `Suscripción de webhook con ID ${id} no encontrada`,
      );
    }
    return sub.secret
      ? { ...sub, secret: `${sub.secret.slice(0, 4)}****************` }
      : sub;
  }

  @Delete('subscriptions/:id')
  @Roles('admin', 'superadmin')
  @ApiOperation({ summary: 'Elimina una suscripción de webhook por ID' })
  @ApiResponse({
    status: 200,
    description: 'Suscripción eliminada exitosamente',
  })
  async deleteSubscription(
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string }> {
    const deleted = await this.webhooksService.deleteSubscription(id);
    if (!deleted) {
      throw new NotFoundException(
        `Suscripción de webhook con ID ${id} no encontrada`,
      );
    }
    return { success: true, message: 'Suscripción eliminada con éxito' };
  }

  @Post('dispatch-test')
  @Roles('admin', 'superadmin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Despacha un evento de prueba a los suscriptores de webhooks',
  })
  @ApiResponse({
    status: 200,
    description: 'Evento encolado en BullMQ para entrega asíncrona',
  })
  async dispatchTest(
    @Body() dto: DispatchWebhookTestDto,
  ): Promise<{ queuedCount: number; jobIds: string[] }> {
    return this.webhooksService.dispatch(dto.event, dto.data || { test: true });
  }
}
