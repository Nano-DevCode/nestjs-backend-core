import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { IS_PUBLIC_KEY } from '../../auth/decorators/auth.decorator';
import { AuthService } from '../../auth/auth.service';
import { SessionService } from '../../auth/session.service';
import type { AuthenticatedSocket } from '../interfaces/authenticated-socket.interface';
import type { JwtPayload } from '../../auth/jwt.strategy';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const client = context.switchToWs().getClient<AuthenticatedSocket>();

    // Si el socket ya fue autenticado durante el handshake de conexión
    if (client.data?.user || client.user) {
      return true;
    }

    const token = this.extractTokenFromSocket(client);
    if (!token) {
      throw new WsException(
        'No autorizado: Token de autenticación ausente en el handshake WebSocket.',
      );
    }

    const jwtSecret = process.env.JWT_SECRET || 'super_secret_jwt_key';

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token, {
        secret: jwtSecret,
        algorithms: ['HS256'],
      });
    } catch {
      throw new WsException('No autorizado: Token inválido o expirado.');
    }

    // 1. Verificación de revocación por JTI en Redis
    if (payload.jti) {
      const isRevoked = await this.sessionService.isTokenBlacklisted(
        payload.jti,
      );
      if (isRevoked) {
        throw new WsException(
          'No autorizado: Sesión revocada. Conéctate nuevamente.',
        );
      }
    }

    // 2. Verificación de revocación por firma en Redis
    const signature = token.split('.')[2];
    if (
      signature &&
      (await this.sessionService.isTokenBlacklisted(signature))
    ) {
      throw new WsException(
        'No autorizado: Sesión revocada. Conéctate nuevamente.',
      );
    }

    // 3. Cargar contexto fresco de usuario desde PostgreSQL
    try {
      const userContext = await this.authService.getUserAuthContextById(
        payload.sub,
      );

      // Inyectar usuario en el socket
      if (!client.data) {
        client.data = {};
      }
      client.data.user = userContext;
      client.user = userContext;

      return true;
    } catch {
      throw new WsException(
        'No autorizado: Usuario inactivo, no verificado o inexistente.',
      );
    }
  }

  private extractTokenFromSocket(client: AuthenticatedSocket): string | null {
    // 1. Handshake Auth payload: { auth: { token: '...' } }
    const authPayload = client.handshake?.auth;
    if (authPayload?.token && typeof authPayload.token === 'string') {
      return authPayload.token.replace(/^Bearer\s+/i, '').trim();
    }

    // 2. Handshake Headers: Authorization: Bearer <token>
    const authHeader = client.handshake?.headers?.authorization;
    if (
      authHeader &&
      typeof authHeader === 'string' &&
      authHeader.startsWith('Bearer ')
    ) {
      return authHeader.slice(7).trim();
    }

    // 3. Handshake Cookies: access_token=<token>
    const rawCookieHeader = client.handshake?.headers?.cookie;
    if (rawCookieHeader && typeof rawCookieHeader === 'string') {
      const parsedCookies = this.parseCookies(rawCookieHeader);
      if (parsedCookies['access_token']) {
        return parsedCookies['access_token'];
      }
    }

    // 4. Query Params fallback: ws://...?token=...
    const query = client.handshake?.query;
    if (query?.token && typeof query.token === 'string') {
      return query.token.replace(/^Bearer\s+/i, '').trim();
    }

    return null;
  }

  private parseCookies(cookieStr: string): Record<string, string> {
    return cookieStr.split(';').reduce<Record<string, string>>((acc, pair) => {
      const [name, ...val] = pair.trim().split('=');
      if (name && val.length > 0) {
        acc[decodeURIComponent(name)] = decodeURIComponent(val.join('='));
      }
      return acc;
    }, {});
  }
}
