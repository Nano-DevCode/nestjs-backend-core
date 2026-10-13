import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoleName, SYSTEM_ROLE_NAMES } from '../auth/constants/roles.constant';
import type { QueryRolesDto } from './dto/query-roles.dto';

@Injectable()
export class RolesQueryService {
  constructor(private readonly prisma: PrismaService) {}

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
    const sortOrder =
      query?.sortOrder || (sortBy === 'priority' ? 'desc' : 'asc');

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
      throw new NotFoundException(
        `El rol con identificador '${id}' no existe.`,
      );
    }

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      priority: role.priority,
      isSystem: SYSTEM_ROLE_NAMES.includes(role.name),
      userCount: role._count.users,
      permissionCount: role._count.permissions,
      permissions: role.permissions.map((rp) => rp.permission),
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }
}

