import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

interface TrackableRequest {
  user?: { id?: string };
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
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

    // 3. Fallback a IP del cliente para peticiones públicas o anónimas
    const forwarded = request.headers?.['x-forwarded-for'];
    const clientIp =
      typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : request.ip || request.socket?.remoteAddress || 'unknown';

    return Promise.resolve(`ip:${clientIp}`);
  }
}
