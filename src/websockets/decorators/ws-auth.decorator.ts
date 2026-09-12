import { SetMetadata } from '@nestjs/common';
import {
  ROLES_KEY,
  PERMISSIONS_KEY,
  IS_PUBLIC_KEY,
} from '../../auth/decorators/auth.decorator';

/**
 * Define los roles requeridos para ejecutar un evento WebSocket o conectarse a un Gateway.
 * Validado por WsRolesGuard.
 *
 * @example
 * ```typescript
 * @SubscribeMessage('admin_broadcast')
 * @WsRoles('admin')
 * handleBroadcast() { ... }
 * ```
 */
export const WsRoles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Define los permisos RBAC específicos requeridos para un evento WebSocket.
 * Validado por WsPermissionsGuard.
 *
 * @example
 * ```typescript
 * @SubscribeMessage('files_sync')
 * @WsPermissions('files.read', 'files.upload')
 * handleFilesSync() { ... }
 * ```
 */
export const WsPermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Marca un Gateway o evento de WebSocket como público, omitiendo la verificación
 * obligatoria de WsJwtGuard.
 *
 * @example
 * ```typescript
 * @SubscribeMessage('public_announcements')
 * @WsPublic()
 * handleAnnouncements() { ... }
 * ```
 */
export const WsPublic = () => SetMetadata(IS_PUBLIC_KEY, true);
