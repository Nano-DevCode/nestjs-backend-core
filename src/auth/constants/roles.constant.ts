export enum RoleName {
  SUPERADMIN = 'superadmin',
  ADMIN = 'admin',
  USER = 'user',
}

export const ROLE_PRIORITIES: Record<string, number> = {
  [RoleName.SUPERADMIN]: 100, // 👑 Dueño absoluto
  [RoleName.ADMIN]: 50,      // 🛡️ Administrador operativo
  [RoleName.USER]: 10,       // 👤 Usuario regular
};

/**
 * Calcula la prioridad máxima entre los roles asignados a un usuario.
 * @param roles Lista de nombres de rol (ej: ['user', 'admin'])
 * @returns Prioridad numérica más alta encontrada (0 si no tiene roles reconocidos)
 */
export function getHighestRolePriority(roles: string[] = []): number {
  if (!roles || roles.length === 0) return 0;
  return Math.max(
    ...roles.map((r) => ROLE_PRIORITIES[r.toLowerCase()] ?? 0),
    0,
  );
}

