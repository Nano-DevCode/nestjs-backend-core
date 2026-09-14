import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { UseGuards, UseFilters, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import { WsJwtGuard } from '../guards/ws-jwt.guard';
import { WsRolesGuard } from '../guards/ws-roles.guard';
import { WsPermissionsGuard } from '../guards/ws-permissions.guard';
import { WsTwoFactorGuard } from '../guards/ws-2fa.guard';
import { WsFeatureFlagGuard } from '../guards/ws-feature.guard';
import { WsAllExceptionsFilter } from '../filters/ws-exception.filter';
import { WsCurrentUser } from '../decorators/ws-current-user.decorator';
import {
  WsRoles,
  WsPermissions,
  WsPublic,
} from '../decorators/ws-auth.decorator';
import { WsRequire2FA } from '../decorators/ws-2fa.decorator';
import { WsRequireFeature } from '../decorators/ws-feature.decorator';
import { WsClient, WsPayload } from '../decorators/ws-client.decorator';
import type { AuthenticatedSocket } from '../interfaces/authenticated-socket.interface';

import type { UserAuthContext } from '../../auth/interfaces/auth.interface';

@UseFilters(WsAllExceptionsFilter)
@WebSocketGateway({
  cors: {
    origin: (
      _origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, true);
    },
    credentials: true,
  },
  namespace: '/realtime',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: AuthenticatedSocket) {
    this.logger.log(`[WebSocket] Conexión entrante: ${client.id}`);
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`[WebSocket] Desconexión: ${client.id}`);
  }

  /**
   * Evento público de prueba de conectividad y latencia (ping-pong)
   */
  @WsPublic()
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('public_ping')
  handlePublicPing(@WsClient() client: AuthenticatedSocket) {
    return {
      event: 'public_pong',
      data: { time: Date.now(), socketId: client.id },
    };
  }

  /**
   * Evento autenticado: Inyecta el usuario con @WsCurrentUser()
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('whoami')
  handleWhoAmI(@WsCurrentUser() user: UserAuthContext) {
    return {
      event: 'whoami_response',
      data: {
        id: user.id,
        email: user.email,
        roles: user.roles,
        permissions: user.permissions,
        isTwoFactorEnabled: user.isTwoFactorEnabled,
      },
    };
  }

  /**
   * Evento protegido por Roles RBAC (@WsRoles('admin'))
   */
  @UseGuards(WsJwtGuard, WsRolesGuard)
  @WsRoles('admin')
  @SubscribeMessage('admin_broadcast')
  handleAdminBroadcast(
    @WsCurrentUser() user: UserAuthContext,
    @WsPayload() payload: { message: string },
  ) {
    this.logger.log(`Broadcast administrativo emitido por ${user.email}`);
    return {
      event: 'broadcast_received',
      data: { sender: user.email, message: payload?.message },
    };
  }

  /**
   * Evento protegido por Permisos granulares (@WsPermissions('files.read'))
   */
  @UseGuards(WsJwtGuard, WsPermissionsGuard)
  @WsPermissions('files.read')
  @SubscribeMessage('subscribe_file_updates')
  handleFileSubscription(@WsCurrentUser() user: UserAuthContext) {
    return {
      event: 'subscription_success',
      data: { channel: 'files', user: user.email },
    };
  }

  /**
   * Evento de alta seguridad protegido por Step-Up 2FA (@WsRequire2FA())
   */
  @UseGuards(WsJwtGuard, WsTwoFactorGuard)
  @WsRequire2FA()
  @SubscribeMessage('critical_ws_operation')
  handleCriticalOperation(@WsCurrentUser() user: UserAuthContext) {
    return {
      event: 'critical_ack',
      data: {
        success: true,
        message: `Acción crítica en tiempo real autorizada bajo 2FA para ${user.email}.`,
      },
    };
  }

  /**
   * Evento condicionado por Feature Flag (@WsRequireFeature('BETA_FEATURE'))
   */
  @UseGuards(WsJwtGuard, WsFeatureFlagGuard)
  @WsRequireFeature('BETA_FEATURE')
  @SubscribeMessage('beta_stream')
  handleBetaStream(@WsCurrentUser() user: UserAuthContext) {
    return {
      event: 'beta_data',
      data: { feature: 'BETA_FEATURE', activeFor: user.email },
    };
  }
}
