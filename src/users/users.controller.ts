import {
  Controller,
  Delete,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  AuditContext,
  type AuditMetadata,
} from '../common/decorators/audit-context.decorator';
import type { UserAuthContext } from '../auth/interfaces/auth.interface';
import { AppPermission } from '../auth/constants/permissions.constant';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '../common/scalar/scalar.decorators';

@ApiTags('Users Administration')
@ApiBearerAuth('bearer-jwt')
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions(AppPermission.USERS_READ)
  @ApiOperation({
    summary:
      'Lista usuarios con paginación, filtros de rol y búsqueda por texto',
    description:
      'Retorna el directorio de usuarios con información de perfil y roles asignados.',
  })
  @ApiResponse({
    status: 200,
    description: 'Directorio paginado de usuarios obtenido exitosamente',
  })
  findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(AppPermission.USERS_READ)
  @ApiOperation({
    summary: 'Obtiene el detalle completo de un usuario por su UUID',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'UUID del usuario a consultar',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle del usuario obtenido exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuario no encontrado',
  })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  @RequirePermissions(AppPermission.USERS_CREATE)
  @ApiOperation({
    summary: 'Crea un nuevo usuario de forma administrativa',
    description:
      'Registra al usuario con perfil, contraseña y rol respetando la jerarquía de prioridad.',
  })
  @ApiResponse({
    status: 201,
    description: 'Usuario creado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos o incompletos',
  })
  @ApiResponse({
    status: 409,
    description: 'El correo electrónico ya existe en el sistema',
  })
  create(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() currentUser: UserAuthContext,
    @AuditContext() auditMeta?: AuditMetadata,
  ) {
    return this.usersService.create(createUserDto, currentUser, auditMeta);
  }

  @Patch(':id')
  @RequirePermissions(AppPermission.USERS_UPDATE)
  @ApiOperation({
    summary: 'Actualiza los datos, perfil o rol de un usuario existente',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'UUID del usuario a actualizar',
  })
  @ApiResponse({
    status: 200,
    description: 'Usuario actualizado exitosamente',
  })
  @ApiResponse({
    status: 403,
    description: 'No tienes rango para modificar a este usuario',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: UserAuthContext,
    @AuditContext() auditMeta?: AuditMetadata,
  ) {
    return this.usersService.update(id, updateUserDto, currentUser, auditMeta);
  }

  @Delete(':id')
  @RequirePermissions(AppPermission.USERS_DELETE)
  @ApiOperation({
    summary: 'Elimina lógicamente (soft-delete) a un usuario del sistema',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'UUID del usuario a eliminar',
  })
  @ApiResponse({
    status: 200,
    description: 'Usuario desactivado exitosamente',
  })
  @ApiResponse({
    status: 403,
    description:
      'No se puede eliminar a un usuario de jerarquía superior o igual',
  })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: UserAuthContext,
    @AuditContext() auditMeta?: AuditMetadata,
  ) {
    return this.usersService.softDelete(id, currentUser, auditMeta);
  }

  @Patch(':id/restore')
  @RequirePermissions(AppPermission.USERS_DELETE)
  @ApiOperation({
    summary: 'Restaura a un usuario previamente eliminado',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'UUID del usuario a reactivar',
  })
  @ApiResponse({
    status: 200,
    description: 'Usuario restaurado exitosamente',
  })
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: UserAuthContext,
    @AuditContext() auditMeta?: AuditMetadata,
  ) {
    return this.usersService.restore(id, currentUser, auditMeta);
  }
}
