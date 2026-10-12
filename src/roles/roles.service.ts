import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersHierarchyService } from '../users/users-hierarchy.service';
import { AuditService } from '../audit/audit.service';
import {
  RoleName,
  SYSTEM_ROLE_NAMES,
} from '../auth/constants/roles.constant';
import type { UserAuthContext } from '../auth/interfaces/auth.interface';
import type { AuditMetadata } from '../common/decorators/audit-context.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { QueryRolesDto } from './dto/query-roles.dto';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchyService: UsersHierarchyService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Lista roles disponibles con paginación, filtros de búsqueda, ordenamiento y estadísticas
   */
  async getRoles(query?: QueryRolesDto) {
    const isAll = query?.all === true;
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query?.limit) || 10));
    const skip = (page - 1) * limit;

    const where: Record<string, any> = {};
    if (query?.search?.trim()) {
      const searchTerm = query.search.trim();
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const sortBy = query?.sortBy || 'priority';
    const sortOrder = query?.sortOrder || (sortBy === 'priority' ? 'desc' : 'asc');

    const [total, roles] = await Promise.all([
      this.prisma.role.count({ where }),
      this.prisma.role.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        ...(isAll ? {} : { skip, take: limit }),
        include: {
          _count: {
            select: { users: true, permissions: true },
          },
          permissions: {
            include: {
              permission: {
                select: { id: true, slug: true, description: true },
              },
            },
          },
        },
      }),
    ]);

    const mappedRoles = roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      priority: r.priority,
      isSystem: SYSTEM_ROLE_NAMES.includes(r.name as RoleName),
      userCount: r._count.users,
      permissionCount: r._count.permissions,
      permissions: r.permissions.map((rp) => rp.permission),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    const totalPages = isAll ? 1 : Math.ceil(total / limit) || 1;

    return {
      roles: mappedRoles,
      data: mappedRoles,
      total,
      page: isAll ? 1 : page,
      limit: isAll ? total : limit,
      totalPages,
      hasNextPage: isAll ? false : page < totalPages,
      hasPrevPage: isAll ? false : page > 1,
    };
  }

  /**
   * Obtiene todos los permisos disponibles en el sistema (para la matriz de checkboxes)
   */
  async getAllPermissions() {
    return this.prisma.permission.findMany({
      orderBy: { slug: 'asc' },
      select: {
        id: true,
        slug: true,
        description: true,
      },
    });
  }

  /**
   * Obtiene el detalle de un rol específico por ID
   */
  async getRoleById(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: true, permissions: true },
        },
        permissions: {
          include: {
            permission: {
              select: { id: true, slug: true, description: true },
            },
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`El rol con identificador '${id}' no existe.`);
    }

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      priority: role.priority,
      isSystem: SYSTEM_ROLE_NAMES.includes(role.name as RoleName),
      userCount: role._count.users,
      permissionCount: role._count.permissions,
      permissions: role.permissions.map((rp) => rp.permission),
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  /**
   * Crea un nuevo rol asegurando unicidad de nombre, jerarquía estricta y vinculación atómica
   */
  async createRole(
    dto: CreateRoleDto,
    currentUser?: UserAuthContext,
    auditMeta?: AuditMetadata,
  ) {
    // 1. Regla de Oro de Jerarquía: No se puede asignar una prioridad igual o superior al rol del creador
    this.hierarchyService.assertCanSetPriority(currentUser, dto.priority);

    const normalizedName = dto.name.trim().toLowerCase();

    // 2. Unicidad de Nombre (Case-Insensitive)
    const existing = await this.prisma.role.findFirst({
      where: { name: { equals: normalizedName, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe un rol registrado con el nombre '${normalizedName}'.`,
      );
    }

    // 3. Verificación de existencia de permisos solicitados
    if (dto.permissionIds && dto.permissionIds.length > 0) {
      const foundPerms = await this.prisma.permission.findMany({
        where: { id: { in: dto.permissionIds } },
        select: { id: true },
      });
      if (foundPerms.length !== dto.permissionIds.length) {
        throw new BadRequestException(
          'Uno o más identificadores de permisos proporcionados no existen en el sistema.',
        );
      }
    }

    // 4. Creación Atómica en Transacción
    const createdRole = await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          name: normalizedName,
          description: dto.description?.trim() || null,
          priority: dto.priority,
        },
      });

      if (dto.permissionIds && dto.permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: dto.permissionIds.map((permId) => ({
            roleId: role.id,
            permissionId: permId,
          })),
        });
      }

      return role;
    });

    // 5. Auditoría Forense
    if (auditMeta) {
      await this.auditService.log({
        context: auditMeta,
        action: 'ROLE_CREATED',
        entity: 'Role',
        entityId: createdRole.id,
        details: {
          name: createdRole.name,
          priority: createdRole.priority,
          permissionCount: dto.permissionIds?.length ?? 0,
        },
      });
    }

    return this.getRoleById(createdRole.id);
  }

  /**
   * Actualiza un rol existente con validación de inmutabilidad del sistema y jerarquía
   */
  async updateRole(
    id: string,
    dto: UpdateRoleDto,
    currentUser?: UserAuthContext,
    auditMeta?: AuditMetadata,
  ) {
    const existingRole = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: true },
    });

    if (!existingRole) {
      throw new NotFoundException(`El rol con identificador '${id}' no existe.`);
    }

    // 1. Jerarquía: Quien edita debe tener mayor prioridad que el rol objetivo actual
    this.hierarchyService.assertCanManageRolePriority(
      currentUser,
      existingRole.priority,
      'modificar',
    );

    // 2. Protección de Roles Base del Sistema (superadmin, admin, user)
    const isSystemRole = SYSTEM_ROLE_NAMES.includes(existingRole.name as RoleName);
    if (isSystemRole && dto.name && dto.name.trim().toLowerCase() !== existingRole.name) {
      throw new BadRequestException(
        `El nombre del rol base del sistema '${existingRole.name}' está protegido y no puede renombrarse.`,
      );
    }
    if (isSystemRole && dto.priority !== undefined && dto.priority !== existingRole.priority) {
      throw new BadRequestException(
        `La jerarquía de prioridad del rol del sistema '${existingRole.name}' está protegida y no puede alterarse.`,
      );
    }

    // 3. Jerarquía sobre la nueva prioridad asignada
    if (dto.priority !== undefined) {
      this.hierarchyService.assertCanSetPriority(currentUser, dto.priority);
    }

    // 4. Unicidad de Nombre si se cambia
    let normalizedName: string | undefined;
    if (dto.name) {
      normalizedName = dto.name.trim().toLowerCase();
      if (normalizedName !== existingRole.name) {
        const duplicate = await this.prisma.role.findFirst({
          where: {
            name: { equals: normalizedName, mode: 'insensitive' },
            NOT: { id },
          },
        });
        if (duplicate) {
          throw new ConflictException(
            `Ya existe otro rol registrado con el nombre '${normalizedName}'.`,
          );
        }
      }
    }

    // 5. Verificación de existencia de permisos
    if (dto.permissionIds && dto.permissionIds.length > 0) {
      const foundPerms = await this.prisma.permission.findMany({
        where: { id: { in: dto.permissionIds } },
        select: { id: true },
      });
      if (foundPerms.length !== dto.permissionIds.length) {
        throw new BadRequestException(
          'Uno o más identificadores de permisos proporcionados no existen en el sistema.',
        );
      }
    }

    // 6. Actualización Atómica en Transacción
    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: {
          ...(normalizedName ? { name: normalizedName } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        },
      });

      if (dto.permissionIds !== undefined) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (dto.permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: dto.permissionIds.map((permId) => ({
              roleId: id,
              permissionId: permId,
            })),
          });
        }
      }
    });

    // 7. Auditoría Forense
    if (auditMeta) {
      await this.auditService.log({
        context: auditMeta,
        action: 'ROLE_UPDATED',
        entity: 'Role',
        entityId: id,
        details: {
          previousName: existingRole.name,
          newName: normalizedName ?? existingRole.name,
          priority: dto.priority ?? existingRole.priority,
        },
      });
    }

    return this.getRoleById(id);
  }

  /**
   * Elimina un rol validando que no sea del sistema, no tenga usuarios y respete la jerarquía
   */
  async deleteRole(
    id: string,
    currentUser?: UserAuthContext,
    auditMeta?: AuditMetadata,
  ) {
    const existingRole = await this.prisma.role.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });

    if (!existingRole) {
      throw new NotFoundException(`El rol con identificador '${id}' no existe.`);
    }

    // 1. Prohibir eliminación de roles del sistema
    if (SYSTEM_ROLE_NAMES.includes(existingRole.name as RoleName)) {
      throw new BadRequestException(
        `Los roles base del sistema (${SYSTEM_ROLE_NAMES.join(', ')}) son vitales para la plataforma y no pueden ser eliminados.`,
      );
    }

    // 2. Jerarquía: Quien elimina debe tener mayor prioridad
    this.hierarchyService.assertCanManageRolePriority(
      currentUser,
      existingRole.priority,
      'eliminar',
    );

    // 3. Integridad referencial: No borrar roles que tengan usuarios asignados
    if (existingRole._count.users > 0) {
      throw new BadRequestException(
        `No es posible eliminar el rol '${existingRole.name}' porque actualmente tiene ${existingRole._count.users} usuario(s) asignado(s). Reasigna los usuarios antes de proceder.`,
      );
    }

    // 4. Eliminación Atómica en Transacción
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.role.delete({ where: { id } });
    });

    // 5. Auditoría Forense
    if (auditMeta) {
      await this.auditService.log({
        context: auditMeta,
        action: 'ROLE_DELETED',
        entity: 'Role',
        entityId: id,
        details: {
          name: existingRole.name,
          priority: existingRole.priority,
        },
      });
    }

    return {
      success: true,
      message: `El rol '${existingRole.name}' fue eliminado exitosamente.`,
    };
  }
}
