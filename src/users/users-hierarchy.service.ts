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
}
