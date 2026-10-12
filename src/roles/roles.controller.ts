import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, RequirePermissions } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  AuditContext,
  type AuditMetadata,
} from '../common/decorators/audit-context.decorator';
import type { UserAuthContext } from '../auth/interfaces/auth.interface';
import { RoleName } from '../auth/constants/roles.constant';
import { AppPermission } from '../auth/constants/permissions.constant';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { QueryRolesDto } from './dto/query-roles.dto';

@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN, RoleName.SUPERADMIN)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /**
   * Lista todos los roles registrados en el sistema con soporte de paginación y filtros
   */
  @Get()
  async getRoles(@Query() query: QueryRolesDto = {}) {
    return this.rolesService.getRoles(query);
  }

  /**
   * Lista el catálogo completo de permisos del sistema para la matriz de asignación
   */
  @Get('permissions')
  async getPermissions() {
    return this.rolesService.getAllPermissions();
  }

  /**
   * Obtiene la información detallada de un rol específico
   */
  @Get(':id')
  async getRoleById(@Param('id') id: string) {
    return this.rolesService.getRoleById(id);
  }

  /**
   * Crea un nuevo rol en el sistema validando jerarquía de prioridad
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(AppPermission.ROLES_MANAGE)
  async createRole(
    @Body() dto: CreateRoleDto,
    @CurrentUser() currentUser: UserAuthContext,
    @AuditContext() auditMeta: AuditMetadata,
  ) {
    return this.rolesService.createRole(dto, currentUser, auditMeta);
  }

  /**
   * Actualiza el nombre, descripción, prioridad o permisos de un rol existente
   */
  @Patch(':id')
  @RequirePermissions(AppPermission.ROLES_MANAGE)
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() currentUser: UserAuthContext,
    @AuditContext() auditMeta: AuditMetadata,
  ) {
    return this.rolesService.updateRole(id, dto, currentUser, auditMeta);
  }

  /**
   * Elimina un rol personalizado asegurando que no tenga usuarios asignados
   */
  @Delete(':id')
  @RequirePermissions(AppPermission.ROLES_MANAGE)
  async deleteRole(
    @Param('id') id: string,
    @CurrentUser() currentUser: UserAuthContext,
    @AuditContext() auditMeta: AuditMetadata,
  ) {
    return this.rolesService.deleteRole(id, currentUser, auditMeta);
  }
}
