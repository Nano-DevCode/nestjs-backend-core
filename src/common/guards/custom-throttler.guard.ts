import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

interface TrackableRequest {
  user?: { id?: string };
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    // Si no es petición HTTP (por ejemplo WebSocket WsContext o RPC), omitir throttling
    if (context.getType() !== 'http') {
      return true;
    }
    return super.canActivate(context);
  }

  protected override getTracker(req: Record<string, any>): Promise<string> {
    const request = req as TrackableRequest;

    // 1. Si el usuario está autenticado, rastrear por ID único
    // Previene que múltiples usuarios bajo CGNAT móvil o Wi-Fi institucional compartan el mismo cupo
    if (request.user?.id) {
      return Promise.resolve(`user:${request.user.id}`);
    }

    // 2. Si la petición incluye cabecera Bearer antes de resolverse el guard de auth
    const authHeader = request.headers?.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const parts = token.split('.');
      if (parts.length === 3 && parts[2]) {
        return Promise.resolve(`token:${parts[2]}`);
      }
    }

    // 3. Si la petición web incluye cookie de sesión access_token (Web SPA antes de resolver passport)
    const cookies = (request as Record<string, any>).cookies as
      Record<string, string | undefined> | undefined;
    const cookieToken = cookies?.['access_token'];
    if (typeof cookieToken === 'string') {
      const parts = cookieToken.split('.');
      if (parts.length === 3 && parts[2]) {
        return Promise.resolve(`cookie_token:${parts[2]}`);
      }
    }

    // 4. Si el cliente móvil incluye cabecera de dispositivo única
    const deviceId =
      request.headers?.['x-device-id'] || request.headers?.['X-Device-Id'];
    if (typeof deviceId === 'string' && deviceId.trim().length > 0) {
      return Promise.resolve(`device:${deviceId.trim()}`);
    }

    // 5. Fallback a IP del cliente para peticiones públicas o anónimas
    const forwarded = request.headers?.['x-forwarded-for'];
    const clientIp =
      typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : request.ip || request.socket?.remoteAddress || 'unknown';

    return Promise.resolve(`ip:${clientIp}`);
  }
}
