export enum AppPermission {
  USERS_READ = 'users:read',
  USERS_CREATE = 'users:create',
  USERS_UPDATE = 'users:update',
  USERS_DELETE = 'users:delete',
  USERS_EXPORT = 'users:export',
  ROLES_MANAGE = 'roles:manage',
}

export interface PermissionDefinition {
  slug: AppPermission;
  description: string;
  category: string;
}

export const SYSTEM_PERMISSIONS: PermissionDefinition[] = [
  {
    slug: AppPermission.USERS_READ,
    description: 'Consultar y listar usuarios del sistema',
    category: 'Usuarios',
  },
  {
    slug: AppPermission.USERS_CREATE,
    description: 'Crear nuevos usuarios en el sistema',
    category: 'Usuarios',
  },
  {
    slug: AppPermission.USERS_UPDATE,
    description: 'Editar información y estado de usuarios',
    category: 'Usuarios',
  },
  {
    slug: AppPermission.USERS_DELETE,
    description: 'Dar de baja o restaurar usuarios',
    category: 'Usuarios',
  },
  {
    slug: AppPermission.USERS_EXPORT,
    description: 'Exportar listas y reportes de usuarios',
    category: 'Usuarios',
  },
  {
    slug: AppPermission.ROLES_MANAGE,
    description: 'Administrar roles, prioridades y permisos',
    category: 'Roles y Seguridad',
  },
];
