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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '../common/scalar/scalar.decorators';

@ApiTags('Roles & RBAC')
@ApiBearerAuth('bearer-jwt')
@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN, RoleName.SUPERADMIN)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /**
   * Lista todos los roles registrados en el sistema con soporte de paginación y filtros
   */
  @Get()
  @ApiOperation({
    summary: 'Lista roles registrados con paginación, ordenamiento y búsqueda',
    description:
      'Devuelve el listado paginado de roles con sus prioridades y conteo de permisos asignados.',
  })
  @ApiResponse({
    status: 200,
    description: 'Catálogo paginado de roles obtenido exitosamente',
  })
  async getRoles(@Query() query: QueryRolesDto = {}) {
    return this.rolesService.getRoles(query);
  }

  /**
   * Lista el catálogo completo de permisos del sistema para la matriz de asignación
   */
  @Get('permissions')
  @ApiOperation({
    summary: 'Obtiene el catálogo de todos los permisos disponibles',
    description:
      'Retorna la lista maestra de permisos (modulo:accion) para renderizar la matriz de asignación RBAC.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista completa de permisos del sistema',
  })
  async getPermissions() {
    return this.rolesService.getAllPermissions();
  }

  /**
   * Obtiene la información detallada de un rol específico
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Obtiene la información y permisos detallados de un rol por ID',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Identificador único del rol',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle del rol y permisos asociados',
  })
  @ApiResponse({
    status: 404,
    description: 'Rol no encontrado',
  })
  async getRoleById(@Param('id') id: string) {
    return this.rolesService.getRoleById(id);
  }

  /**
   * Crea un nuevo rol en el sistema validando jerarquía de prioridad
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(AppPermission.ROLES_MANAGE)
  @ApiOperation({
    summary:
      'Crea un nuevo rol validando la jerarquía matemática de prioridades',
    description:
      'El rol nuevo no puede poseer una prioridad igual o superior a la del usuario que lo crea.',
  })
  @ApiResponse({
    status: 201,
    description: 'Rol creado exitosamente',
  })
  @ApiResponse({
    status: 403,
    description: 'Jerarquía de prioridad no permitida',
  })
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
  @ApiOperation({
    summary: 'Actualiza los atributos o permisos de un rol',
    description:
      'Valida que el usuario tenga rango suficiente para modificar el rol destino.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Identificador único del rol a actualizar',
  })
  @ApiResponse({
    status: 200,
    description: 'Rol actualizado exitosamente',
  })
  @ApiResponse({
    status: 403,
    description: 'No tienes privilegios suficientes para modificar este rol',
  })
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
  @ApiOperation({
    summary: 'Elimina un rol personalizado',
    description:
      'Impide la eliminación de roles del sistema base o roles con usuarios activos asignados.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Identificador único del rol a eliminar',
  })
  @ApiResponse({
    status: 200,
    description: 'Rol eliminado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description:
      'No se puede eliminar un rol protegido o con usuarios asociados',
  })
  async deleteRole(
    @Param('id') id: string,
    @CurrentUser() currentUser: UserAuthContext,
    @AuditContext() auditMeta: AuditMetadata,
  ) {
    return this.rolesService.deleteRole(id, currentUser, auditMeta);
  }
}
