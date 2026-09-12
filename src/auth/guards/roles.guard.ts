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

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();
    const user = request.user;

    if (!user || !user.roles || user.roles.length === 0) {
      // Check if user has required permissions before rejecting
      const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
        PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      );

      const hasPermission =
        requiredPermissions &&
        requiredPermissions.length > 0 &&
        user?.permissions &&
        user.permissions.length > 0 &&
        requiredPermissions.every(
          (perm) =>
            user.permissions?.includes(perm) ||
            user.permissions?.includes(perm.replace('.', ':')) ||
            user.permissions?.includes(perm.replace(':', '.')),
        );

      if (hasPermission) {
        return true;
      }

      throw new ForbiddenException(
        'No tienes los permisos necesarios para acceder a este recurso',
      );
    }

    const hasRole = requiredRoles.some((role) => user.roles?.includes(role));
    if (hasRole) {
      return true;
    }

    // Si no coincide el rol, comprobar si cumple con los permisos requeridos
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const hasPermission =
      requiredPermissions &&
      requiredPermissions.length > 0 &&
      user.permissions &&
      user.permissions.length > 0 &&
      requiredPermissions.every(
        (perm) =>
          user.permissions?.includes(perm) ||
          user.permissions?.includes(perm.replace('.', ':')) ||
          user.permissions?.includes(perm.replace(':', '.')),
      );

    if (hasPermission) {
      return true;
    }

    throw new ForbiddenException(
      'No tienes los permisos necesarios para acceder a este recurso',
    );
  }
}
