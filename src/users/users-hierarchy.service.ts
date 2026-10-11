import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import type { UserAuthContext } from '../auth/interfaces/auth.interface';
import { getHighestRolePriority } from '../auth/constants/roles.constant';

@Injectable()
export class UsersHierarchyService {
  /**
   * Previene que un usuario intente realizar una acción administrativa sobre sí mismo
   */
  assertNotSelf(
    currentUserId: string | undefined,
    targetUserId: string,
    actionMessage: string,
  ): void {
    if (currentUserId && currentUserId === targetUserId) {
      throw new BadRequestException(actionMessage);
    }
  }

  /**
   * Valida que el usuario autenticado tenga mayor jerarquía que el usuario objetivo
   */
  assertCanManageTarget(
    currentUser: UserAuthContext | undefined,
    targetRoles: Array<{ role?: { priority?: number } }>,
    actionDescription: string,
  ): void {
    if (!currentUser) return;

    const currentPriority =
      currentUser.priority ?? getHighestRolePriority(currentUser.roles);
    const targetPriority = Math.max(
      ...targetRoles.map((r) => r.role?.priority ?? 0),
      0,
    );

    if (currentPriority <= targetPriority) {
      throw new ForbiddenException(
        `No tienes privilegios suficientes para ${actionDescription} a un usuario de igual o mayor jerarquía`,
      );
    }
  }

  /**
   * Valida que quien asigna roles no otorgue un rol de igual o mayor jerarquía a la suya
   */
  assertCanAssignRoles(
    currentUser: UserAuthContext | undefined,
    rolesToAssign: Array<{ priority: number }>,
  ): void {
    if (!currentUser) return;

    const currentPriority =
      currentUser.priority ?? getHighestRolePriority(currentUser.roles);
    const maxTargetPriority = Math.max(
      ...rolesToAssign.map((r) => r.priority ?? 0),
      0,
    );

    if (currentPriority <= maxTargetPriority) {
      throw new ForbiddenException(
        'No tienes privilegios suficientes para asignar un rol con jerarquía igual o superior a la tuya',
      );
    }
  }

  /**
   * Obtiene la prioridad efectiva de un usuario
   */
  getUserPriority(currentUser: UserAuthContext | undefined): number {
    if (!currentUser) return 0;
    return currentUser.priority ?? getHighestRolePriority(currentUser.roles);
  }

  /**
   * Valida que un usuario no pueda crear ni actualizar un rol con prioridad igual o superior a la suya
   */
  assertCanSetPriority(
    currentUser: UserAuthContext | undefined,
    targetPriority: number,
  ): void {
    const currentPriority = this.getUserPriority(currentUser);
    if (targetPriority >= currentPriority) {
      throw new ForbiddenException(
        `No puedes asignar una prioridad (${targetPriority}) igual o superior a la de tu rol (${currentPriority}).`,
      );
    }
  }

  /**
   * Valida que un usuario no pueda modificar ni eliminar un rol con prioridad igual o mayor a la suya
   */
  assertCanManageRolePriority(
    currentUser: UserAuthContext | undefined,
    rolePriority: number,
    action = 'modificar',
  ): void {
    const currentPriority = this.getUserPriority(currentUser);
    if (rolePriority >= currentPriority) {
      throw new ForbiddenException(
        `No tienes privilegios suficientes para ${action} un rol con prioridad (${rolePriority}) igual o superior a la tuya (${currentPriority}).`,
      );
    }
  }
}
