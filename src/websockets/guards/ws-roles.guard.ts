import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
import { ROLES_KEY } from '../../auth/decorators/auth.decorator';
import type { AuthenticatedSocket } from '../interfaces/authenticated-socket.interface';

@Injectable()
export class WsRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const client = context.switchToWs().getClient<AuthenticatedSocket>();
    const user = client.data?.user ?? client.user;

    if (!user) {
      throw new WsException(
        'WsRolesGuard: Usuario no autenticado en el socket. Asegúrate de aplicar WsJwtGuard primero.',
      );
    }

    const userRoles = user.roles || [];

    // Super admin tiene acceso total
    if (userRoles.includes('admin')) {
      return true;
    }

    const hasRole = requiredRoles.some((role) => userRoles.includes(role));
    if (!hasRole) {
      throw new WsException(
        `Prohibido: Rol insuficiente. Se requiere alguno de los siguientes roles: [${requiredRoles.join(', ')}].`,
      );
    }

    return true;
  }
}
