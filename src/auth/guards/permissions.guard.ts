import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  ROLES_KEY,
  PERMISSIONS_KEY,
  IS_PUBLIC_KEY,
} from '../decorators/auth.decorator';

interface RequestUser {
  id: string;
  email: string;
  roles?: string[];
  permissions?: string[];
}

interface AuthenticatedRequest extends Request {
  user?: RequestUser;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<
      string[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    const requiredPermissions = this.reflector.getAllAndOverride<
      string[] | undefined
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredRoles && !requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException(
        'No tienes los permisos necesarios para acceder a este recurso',
      );
    }

    // Rol admin tiene acceso completo
    if (user.roles?.includes('admin')) {
      return true;
    }

    // Verificar si cumple los permisos requeridos
    if (requiredPermissions && requiredPermissions.length > 0) {
      const hasAllPermissions =
        user.permissions &&
        user.permissions.length > 0 &&
        requiredPermissions.every(
          (perm) =>
            user.permissions?.includes(perm) ||
            user.permissions?.includes(perm.replace('.', ':')) ||
            user.permissions?.includes(perm.replace(':', '.')),
        );

      if (hasAllPermissions) {
        return true;
      }

      throw new ForbiddenException(
        'No tienes los permisos necesarios para acceder a este recurso',
      );
    }

    // Si solo se requerían roles
    if (requiredRoles && requiredRoles.length > 0) {
      if (!user.roles || user.roles.length === 0) {
        throw new ForbiddenException(
          'No tienes los permisos necesarios para acceder a este recurso',
        );
      }
      const hasRole = requiredRoles.some((role) => user.roles?.includes(role));
      if (!hasRole) {
        throw new ForbiddenException(
          'No tienes los permisos necesarios para acceder a este recurso',
        );
      }
    }

    return true;
  }
}
