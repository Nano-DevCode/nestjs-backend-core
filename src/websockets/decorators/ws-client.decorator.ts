import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedSocket } from '../interfaces/authenticated-socket.interface';

/**
 * Decorador de parámetro para inyectar la instancia de socket cliente tipada
 * en un método controlador de WebSocket.
 *
 * @example
 * ```typescript
 * @SubscribeMessage('ping')
 * handlePing(@WsClient() socket: AuthenticatedSocket) {
 *   socket.emit('pong', { time: Date.now() });
 * }
 * ```
 */
export const WsClient = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedSocket => {
    return ctx.switchToWs().getClient<AuthenticatedSocket>();
  },
);

/**
 * Decorador de parámetro para inyectar la data o payload del mensaje WebSocket
 * con soporte para extraer una propiedad específica.
 *
 * @example
 * ```typescript
 * @SubscribeMessage('send_message')
 * handleMsg(
 *   @WsPayload() payload: ChatMessageDto,
 *   @WsPayload('roomId') roomId: string,
 * ) { ... }
 * ```
 */
export const WsPayload = createParamDecorator(
  (property: string | undefined, ctx: ExecutionContext): unknown => {
    const data: unknown = ctx.switchToWs().getData();
    if (property && typeof data === 'object' && data !== null) {
      return (data as Record<string, unknown>)[property];
    }
    return data;
  },
);
