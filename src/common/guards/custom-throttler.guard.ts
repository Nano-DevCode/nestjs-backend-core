import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

interface TrackableRequest {
  user?: { id?: string };
  url?: string;
  originalUrl?: string;
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

    const forwarded = request.headers?.['x-forwarded-for'];
    const clientIp =
      typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : request.ip || request.socket?.remoteAddress || 'unknown';

    // 1. Si el usuario ya fue autenticado por un Guard previo, rastrear por ID único
    if (request.user?.id) {
      return Promise.resolve(`user:${request.user.id}`);
    }

    // En endpoints públicos sensibles (login, registro, 2FA, verificación), forzar siempre
    // el rastreo por IP para impedir evasión de fuerza bruta rotando cabeceras Bearer o X-Device-Id
    const targetUrl = request.originalUrl || request.url || '';
    const isSensitiveAuthRoute =
      /\/auth\/(login|register|mobile\/login|resend-verification|verify-email|2fa)/i.test(
        targetUrl,
      );
    if (isSensitiveAuthRoute) {
      return Promise.resolve(`ip:${clientIp}`);
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

    // 4. Si el cliente móvil incluye cabecera de dispositivo, vincularla con la IP
    // para distinguir dispositivos bajo la misma red CGNAT sin permitir evasión desde una misma IP
    const deviceId =
      request.headers?.['x-device-id'] || request.headers?.['X-Device-Id'];
    if (typeof deviceId === 'string' && deviceId.trim().length > 0) {
      return Promise.resolve(
        `ip:${clientIp}:device:${deviceId.trim().slice(0, 64)}`,
      );
    }

    // 5. Fallback a IP del cliente para peticiones públicas o anónimas
    return Promise.resolve(`ip:${clientIp}`);
  }
}
