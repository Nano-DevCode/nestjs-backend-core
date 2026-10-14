import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '../common/scalar/scalar.decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/auth.decorator';
import { AuditQueryService } from './audit-query.service';
import { QueryAuditsDto } from './dto/query-audits.dto';

@ApiTags('Audit & Compliance')
@ApiBearerAuth('bearer-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditQuery: AuditQueryService) {}

  @Get()
  @ApiOperation({
    summary: 'Consulta paginada y filtrada del registro de auditoría forense',
    description:
      'Retorna el historial de acciones administrativas y de negocio con contexto de red, IP, endpoint y usuario (exclusivo administradores).',
  })
  @ApiResponse({
    status: 200,
    description: 'Registros de auditoría obtenidos exitosamente',
  })
  async findAll(@Query() query: QueryAuditsDto) {
    return this.auditQuery.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtiene el detalle completo de un registro de auditoría por UUID',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'UUID del registro de auditoría a consultar',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle del registro de auditoría obtenido exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Registro de auditoría no encontrado',
  })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.auditQuery.findById(id);
  }
}
