import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
import { PERMISSIONS_KEY } from '../../auth/decorators/auth.decorator';
import type { AuthenticatedSocket } from '../interfaces/authenticated-socket.interface';

@Injectable()
export class WsPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const client = context.switchToWs().getClient<AuthenticatedSocket>();
    const user = client.data?.user ?? client.user;

    if (!user) {
      throw new WsException(
        'WsPermissionsGuard: Usuario no autenticado en el socket. Asegúrate de aplicar WsJwtGuard primero.',
      );
    }

    const userPermissions = user.permissions || [];
    const userRoles = user.roles || [];

    // Admin tiene bypass total
    if (userRoles.includes('admin') || userPermissions.includes('*')) {
      return true;
    }

    // Verificar si el usuario posee todos los permisos requeridos
    const hasAll = requiredPermissions.every((perm) =>
      userPermissions.includes(perm),
    );

    if (!hasAll) {
      throw new WsException(
        `Prohibido: Permisos insuficientes para esta operación WebSocket. Requeridos: [${requiredPermissions.join(', ')}].`,
      );
    }

    return true;
  }
}
