import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'socket.io';
import type { AuthenticatedSocket } from '../websockets/interfaces/authenticated-socket.interface';
import { AuthService } from '../auth/auth.service';
import { SessionService } from '../auth/session.service';
import type { JwtPayload } from '../auth/jwt.strategy';
import type { UserAuthContext } from '../auth/interfaces/auth.interface';

@WebSocketGateway({
  cors: {
    origin: (
      _origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Permitir cualquier origen de desarrollo o frontend con credenciales
      callback(null, true);
    },
    credentials: true,
  },
})
export class NotificationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  afterInit(server: Server) {
    this.logger.log(
      '[NotificationsGateway] Inicializado en namespaces "/" y "/realtime/notifications"',
    );

    // Permitir conexiones dirigidas explícitamente al sub-namespace '/realtime/notifications'
    try {
      const notifNamespace = server.of('/realtime/notifications');
      notifNamespace.on('connection', async (socket: AuthenticatedSocket) => {
        await this.handleConnection(socket);
        socket.on('disconnect', () => this.handleDisconnect(socket));
      });
    } catch (err) {
      this.logger.warn(
        `Error al inicializar namespace secundario /realtime/notifications: ${(err as Error).message}`,
      );
    }
  }

  async handleConnection(client: AuthenticatedSocket) {
    const user = await this.authenticateClient(client);
    if (user) {
      const room = `user:${user.id}`;
      await client.join(room);
      this.logger.log(
        `[NotificationsGateway] Cliente ${client.id} (Usuario: ${user.email}) conectado a ${room}`,
      );
    } else {
      this.logger.log(
        `[NotificationsGateway] Conexión entrante: ${client.id} (no autenticado o esperando token)`,
      );
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`[NotificationsGateway] Desconexión: ${client.id}`);
  }

  /**
   * Permite a un cliente autenticarse manualmente tras la conexión si no proveyó token inicial
   */
  @SubscribeMessage('authenticate')
  async handleManualAuth(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { token?: string },
  ) {
    const rawToken = data?.token?.replace(/^Bearer\s+/i, '').trim();
    if (!rawToken) {
      return { success: false, message: 'Token no proporcionado' };
    }

    const user = await this.validateToken(rawToken);
    if (!user) {
      return { success: false, message: 'Token inválido o expirado' };
    }

    if (!client.data) {
      client.data = {};
    }
    client.data.user = user;
    client.user = user;

    const room = `user:${user.id}`;
    await client.join(room);
    this.logger.log(
      `[NotificationsGateway] Cliente ${client.id} autenticado manualmente para ${user.email} en ${room}`,
    );

    return { success: true, user: { id: user.id, email: user.email } };
  }

  sendToUser(userId: string, notification: unknown): void {
    if (!this.server) return;
    const room = `user:${userId}`;

    // 1. Emitir al namespace raíz ('/')
    this.server.to(room).emit('notification', notification);

    // 2. Emitir también al namespace '/realtime/notifications' si hay clientes suscritos allí
    try {
      this.server
        .of('/realtime/notifications')
        .to(room)
        .emit('notification', notification);
    } catch {
      // Ignorar si el sub-namespace no tiene clientes activos
    }

    this.logger.log(
      `[NotificationsGateway] Notificación despachada en tiempo real a ${room}`,
    );
  }

  private async authenticateClient(
    client: AuthenticatedSocket,
  ): Promise<UserAuthContext | null> {
    if (client.user) return client.user;
    if (client.data?.user) return client.data.user;

    const token = this.extractToken(client);
    if (!token) return null;

    const user = await this.validateToken(token);
    if (user) {
      if (!client.data) client.data = {};
      client.data.user = user;
      client.user = user;
    }
    return user;
  }

  private async validateToken(token: string): Promise<UserAuthContext | null> {
    try {
      const jwtSecret = process.env.JWT_SECRET || 'super_secret_jwt_key';
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: jwtSecret,
        algorithms: ['HS256'],
      });

      // 1. Verificación en Redis de revocación por JTI
      if (payload.jti) {
        const isRevoked = await this.sessionService.isTokenBlacklisted(
          payload.jti,
        );
        if (isRevoked) return null;
      }

      // 2. Verificación en Redis de revocación por firma
      const signature = token.split('.')[2];
      if (
        signature &&
        (await this.sessionService.isTokenBlacklisted(signature))
      ) {
        return null;
      }

      // 3. Obtener contexto de usuario (desde caché o BD)
      const cached = await this.sessionService.getCachedUserAuthContext(
        payload.sub,
      );
      if (cached) return cached;

      return await this.authService.getUserAuthContextById(payload.sub);
    } catch {
      return null;
    }
  }

  private extractToken(client: AuthenticatedSocket): string | null {
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

    // 4. Query Params: ws://...?token=...
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
