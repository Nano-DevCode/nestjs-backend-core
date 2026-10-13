import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService, Prisma } from '../prisma/prisma.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SessionService } from '../auth/session.service';
import { PasswordService } from '../auth/password.service';
import { UsersHierarchyService } from './users-hierarchy.service';
import { UsersQueryService } from './users-query.service';
import { AuditService } from '../audit/audit.service';
import { USER_DETAIL_SELECT } from './constants/users.select';
import type { UserAuthContext } from '../auth/interfaces/auth.interface';
import type { AuditMetadata } from '../common/decorators/audit-context.decorator';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly passwordService: PasswordService,
    private readonly hierarchyService: UsersHierarchyService,
    private readonly queryService: UsersQueryService,
    private readonly auditService: AuditService,
  ) {}

  // ==========================================
  // CONSULTAS (Delegadas a UsersQueryService)
  // ==========================================

  async findAll(query: QueryUsersDto) {
    return this.queryService.findAll(query);
  }

  async findById(id: string) {
    return this.queryService.findById(id);
  }

  // ==========================================
  // MUTACIONES / CICLO DE VIDA
  // ==========================================

  async create(
    dto: CreateUserDto,
    currentUser?: UserAuthContext,
    auditMeta?: AuditMetadata,
  ) {
    this.passwordService.validatePasswordStrength(dto.password);
    const hashedPassword = await this.passwordService.hash(dto.password);
    const normalizedEmail = dto.email.toLowerCase().trim();

    let createdResult: {
      message: string;
      user: any;
    };

    try {
      createdResult = await this.prisma.$transaction(async (tx) => {
        let roleIdsToAssign: string[] = [];

        if (dto.roles && dto.roles.length > 0) {
          const foundRoles = await tx.role.findMany({
            where: { name: { in: dto.roles } },
          });

          if (foundRoles.length !== dto.roles.length) {
            const foundNames = new Set(foundRoles.map((r) => r.name));
            const missing = dto.roles.filter((r) => !foundNames.has(r));
            throw new BadRequestException(
              `Los siguientes roles no existen en el sistema: ${missing.join(', ')}`,
            );
          }

          this.hierarchyService.assertCanAssignRoles(currentUser, foundRoles);
          roleIdsToAssign = foundRoles.map((r) => r.id);
        } else {
          const defaultRole = await tx.role.findFirst({
            where: { name: 'user' },
          });
          if (defaultRole) {
            roleIdsToAssign = [defaultRole.id];
          }
        }

        const firstName = dto.profile.firstName.trim();
        const firstLastName = dto.profile.firstLastName.trim();
        const secondLastName = dto.profile.secondLastName.trim();
        const fullName = `${firstName} ${firstLastName} ${secondLastName}`
          .replace(/\s+/g, ' ')
          .trim();

        const newUser = await tx.user.create({
          data: {
            email: normalizedEmail,
            password: hashedPassword,
            name: fullName,
            isActive: dto.isActive ?? true,
            roles: {
              create: roleIdsToAssign.map((roleId) => ({ roleId })),
            },
            profile: {
              create: {
                firstName,
                firstLastName,
                secondLastName,
                bio: dto.profile.bio?.trim(),
                avatarUrl: dto.profile.avatarUrl?.trim(),
              },
            },
          },
          select: USER_DETAIL_SELECT,
        });

        return {
          message: 'Usuario creado exitosamente',
          user: newUser,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'El correo electrónico ya se encuentra registrado en el sistema',
        );
      }
      throw error;
    }

    if (auditMeta) {
      await this.auditService.log({
        context: auditMeta,
        action: 'USER_CREATED',
        entity: 'User',
        entityId: createdResult.user.id,
        details: {
          email: createdResult.user.email,
          name: createdResult.user.name,
          isActive: createdResult.user.isActive,
          roles: dto.roles ?? ['user'],
        },
      });
    }

    return createdResult;
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    currentUser?: UserAuthContext,
    auditMeta?: AuditMetadata,
  ) {
    try {
      const { updatedUser, shouldRevokeSessions } =
        await this.prisma.$transaction(async (tx) => {
          const existingUser = await tx.user.findFirst({
            where: { id },
            include: {
              roles: {
                include: { role: true },
              },
            },
          });

          if (!existingUser) {
            throw new NotFoundException(`Usuario con ID "${id}" no encontrado`);
          }

          if (currentUser?.id !== id) {
            this.hierarchyService.assertCanManageTarget(
              currentUser,
              existingUser.roles,
              'modificar',
            );
          }

          let hashedPassword: string | undefined;
          if (dto.password) {
            this.passwordService.validatePasswordStrength(dto.password);
            hashedPassword = await this.passwordService.hash(dto.password);
          }

          let rolesChanged = false;
          if (dto.roles !== undefined) {
            this.hierarchyService.assertNotSelf(
              currentUser?.id,
              id,
              'No puedes modificar tus propios roles asignados',
            );

            const foundRoles = await tx.role.findMany({
              where: { name: { in: dto.roles } },
            });

            if (foundRoles.length !== dto.roles.length) {
              const foundNames = new Set(foundRoles.map((r) => r.name));
              const missing = dto.roles.filter((r) => !foundNames.has(r));
              throw new BadRequestException(
                `Los siguientes roles no existen en el sistema: ${missing.join(', ')}`,
              );
            }

            this.hierarchyService.assertCanAssignRoles(currentUser, foundRoles);

            await tx.userRole.deleteMany({ where: { userId: id } });
            if (foundRoles.length > 0) {
              await tx.userRole.createMany({
                data: foundRoles.map((r) => ({
                  userId: id,
                  roleId: r.id,
                })),
              });
            }
            rolesChanged = true;
          }

          let computedFullName: string | undefined;

          if (dto.profile) {
            const currentProfile = await tx.profile.findUnique({
              where: { userId: id },
            });
            const fName =
              dto.profile.firstName !== undefined
                ? dto.profile.firstName?.trim()
                : currentProfile?.firstName;
            const fLastName =
              dto.profile.firstLastName !== undefined
                ? dto.profile.firstLastName?.trim()
                : currentProfile?.firstLastName;
            const sLastName =
              dto.profile.secondLastName !== undefined
                ? dto.profile.secondLastName?.trim()
                : currentProfile?.secondLastName;

            if (fName && fLastName && sLastName) {
              computedFullName = `${fName} ${fLastName} ${sLastName}`
                .replace(/\s+/g, ' ')
                .trim();
            }

            await tx.profile.upsert({
              where: { userId: id },
              create: {
                userId: id,
                firstName: dto.profile.firstName?.trim(),
                firstLastName: dto.profile.firstLastName?.trim(),
                secondLastName: dto.profile.secondLastName?.trim(),
                bio: dto.profile.bio?.trim(),
                avatarUrl: dto.profile.avatarUrl?.trim(),
              },
              update: {
                ...(dto.profile.firstName !== undefined && {
                  firstName: dto.profile.firstName?.trim(),
                }),
                ...(dto.profile.firstLastName !== undefined && {
                  firstLastName: dto.profile.firstLastName?.trim(),
                }),
                ...(dto.profile.secondLastName !== undefined && {
                  secondLastName: dto.profile.secondLastName?.trim(),
                }),
                ...(dto.profile.bio !== undefined && {
                  bio: dto.profile.bio?.trim(),
                }),
                ...(dto.profile.avatarUrl !== undefined && {
                  avatarUrl: dto.profile.avatarUrl?.trim(),
                }),
              },
            });
          }

          const userResult = await tx.user.update({
            where: { id },
            data: {
              ...(dto.email && { email: dto.email.toLowerCase().trim() }),
              ...((dto.name !== undefined ||
                computedFullName !== undefined) && {
                name:
                  dto.name !== undefined ? dto.name?.trim() : computedFullName,
              }),
              ...(dto.isActive !== undefined && { isActive: dto.isActive }),
              ...(hashedPassword && { password: hashedPassword }),
            },
            select: USER_DETAIL_SELECT,
          });

          return {
            updatedUser: userResult,
            shouldRevokeSessions:
              rolesChanged || dto.isActive === false || Boolean(hashedPassword),
          };
        });

      if (shouldRevokeSessions) {
        await this.sessionService.revokeAllUserSessions(id);
      }

      if (auditMeta) {
        await this.auditService.log({
          context: auditMeta,
          action: 'USER_UPDATED',
          entity: 'User',
          entityId: id,
          details: {
            email: dto.email ? dto.email.toLowerCase().trim() : undefined,
            name: dto.name,
            isActive: dto.isActive,
            roles: dto.roles,
            passwordUpdated: Boolean(dto.password),
          },
        });
      }

      return {
        message: 'Usuario actualizado exitosamente',
        user: updatedUser,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'El correo electrónico ya se encuentra registrado por otra cuenta',
          );
        }
        if (error.code === 'P2025') {
          throw new NotFoundException(`Usuario con ID "${id}" no encontrado`);
        }
      }
      throw error;
    }
  }

  async softDelete(
    id: string,
    currentUser?: UserAuthContext,
    auditMeta?: AuditMetadata,
  ) {
    this.hierarchyService.assertNotSelf(
      currentUser?.id,
      id,
      'No puedes dar de baja tu propia cuenta',
    );

    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado o ya eliminado');
    }

    this.hierarchyService.assertCanManageTarget(
      currentUser,
      user.roles,
      'dar de baja',
    );

    const deleteUser = await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
      select: { id: true, email: true, deletedAt: true },
    });

    await this.sessionService.revokeAllUserSessions(id);

    if (auditMeta) {
      await this.auditService.log({
        context: auditMeta,
        action: 'USER_SOFT_DELETED',
        entity: 'User',
        entityId: id,
        details: {
          email: user.email,
          roles: user.roles.map((r) => r.role.name),
        },
      });
    }

    return {
      message: 'Usuario dado de baja correctamente',
      deleteUser,
    };
  }

  async restore(
    id: string,
    currentUser?: UserAuthContext,
    auditMeta?: AuditMetadata,
  ) {
    this.hierarchyService.assertNotSelf(
      currentUser?.id,
      id,
      'No puedes restaurar tu propia cuenta desde este panel',
    );

    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: { not: null } },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(
        'El usuario no existe o no está en la papelera',
      );
    }

    this.hierarchyService.assertCanManageTarget(
      currentUser,
      user.roles,
      'restaurar',
    );

    const restoredUser = await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        isActive: true,
      },
    });

    if (auditMeta) {
      await this.auditService.log({
        context: auditMeta,
        action: 'USER_RESTORED',
        entity: 'User',
        entityId: id,
        details: {
          email: user.email,
          isActive: true,
        },
      });
    }

    return {
      message: 'Usuario restaurado exitosamente',
      user: restoredUser,
    };
  }
}
