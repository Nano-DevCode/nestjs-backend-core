import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  Sse,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '../common/scalar/scalar.decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UserAuthContext } from '../auth/interfaces/auth.interface';
import { NotificationsService } from './notifications.service';
import {
  NotificationQueryDto,
  CreateNotificationDto,
} from './dto/notification.dto';
import type { Observable } from 'rxjs';

@ApiTags('Notifications')
@ApiBearerAuth('bearer-jwt')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista y pagina las notificaciones internas del usuario',
  })
  @ApiResponse({
    status: 200,
    description:
      'Lista paginada de notificaciones con total y conteo no leídas',
  })
  async list(
    @CurrentUser() user: UserAuthContext,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationsService.getUserNotifications(user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({
    summary:
      'Obtiene la cantidad de notificaciones no leídas (ideal para badge móvil)',
  })
  async getUnreadCount(@CurrentUser() user: UserAuthContext) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marca una notificación individual como leída' })
  async markAsRead(
    @CurrentUser() user: UserAuthContext,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markAsRead(user.id, id);
  }

  @Patch('read-all')
  @ApiOperation({
    summary: 'Marca todas las notificaciones pendientes como leídas',
  })
  async markAllAsRead(@CurrentUser() user: UserAuthContext) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @Sse('stream')
  @ApiOperation({
    summary:
      'Canal SSE (Server-Sent Events) en tiempo real para recibir alertas directamente',
  })
  streamNotifications(
    @CurrentUser() user: UserAuthContext,
  ): Observable<{ data: unknown }> {
    return this.notificationsService.getStreamForUser(user.id);
  }

  @Post()
  @ApiOperation({
    summary:
      'Crea y despacha una notificación en tiempo real a un usuario específico (por userId o email)',
  })
  @ApiResponse({
    status: 201,
    description: 'Notificación creada y despachada exitosamente',
  })
  async createNotification(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.createNotification(dto);
  }

  @Post('send')
  @ApiOperation({
    summary:
      'Envía y despacha una notificación en tiempo real a un usuario específico (por userId o email)',
  })
  @ApiResponse({
    status: 201,
    description: 'Notificación creada y despachada exitosamente',
  })
  async sendNotification(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.createNotification(dto);
  }
}
