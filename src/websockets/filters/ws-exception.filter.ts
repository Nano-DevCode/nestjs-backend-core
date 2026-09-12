import { Catch, ArgumentsHost } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import type { AuthenticatedSocket } from '../interfaces/authenticated-socket.interface';

@Catch()
export class WsAllExceptionsFilter extends BaseWsExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<AuthenticatedSocket>();

    let message = 'Error interno en el servicio WebSocket';
    let details: unknown = null;

    if (exception instanceof WsException) {
      const error = exception.getError();
      if (typeof error === 'string') {
        message = error;
      } else if (typeof error === 'object' && error !== null) {
        message = (error as { message?: string }).message || message;
        details = error;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    client.emit('exception', {
      status: 'error',
      message,
      details,
      timestamp: new Date().toISOString(),
    });
  }
}
