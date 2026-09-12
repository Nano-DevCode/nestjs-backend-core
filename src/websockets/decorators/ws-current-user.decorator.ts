import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import type { UserAuthContext } from '../../auth/interfaces/auth.interface';
import type { AuthenticatedSocket } from '../interfaces/authenticated-socket.interface';

/**
 * Decorador de parámetro para inyectar el usuario autenticado
 * directamente en los controladores de eventos WebSocket (@SubscribeMessage).
 *
 * Lee el usuario asignado por WsJwtGuard desde `client.data.user` o `client.user`.
 *
 * @example
 * ```typescript
 * @SubscribeMessage('join_room')
 * handleJoin(
 *   @WsCurrentUser() user: UserAuthContext,
 *   @WsCurrentUser('id') userId: string,
 * ) { ... }
 * ```
 */
export const WsCurrentUser = createParamDecorator(
  (
    field: keyof UserAuthContext | undefined,
    ctx: ExecutionContext,
  ): UserAuthContext | UserAuthContext[keyof UserAuthContext] => {
    const client = ctx.switchToWs().getClient<AuthenticatedSocket>();
    const user = client?.data?.user ?? client?.user;

    if (!user) {
      throw new WsException(
        'WsCurrentUser: El socket no tiene una sesión autenticada. Protege el Gateway o evento con @UseGuards(WsJwtGuard).',
      );
    }

    return field ? user[field] : user;
  },
);

export const WsUser = WsCurrentUser;
