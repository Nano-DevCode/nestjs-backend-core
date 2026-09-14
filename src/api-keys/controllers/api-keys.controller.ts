import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '../../common/scalar/scalar.decorators';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Roles } from '../../auth/decorators/auth.decorator';
import { ApiKeysService } from '../services/api-keys.service';
import { CreateApiKeyDto } from '../dto/api-key.dto';

@ApiTags('API Keys Administration')
@ApiBearerAuth('bearer-jwt')
@Controller('api-keys')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('admin')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @ApiOperation({
    summary: 'Genera una nueva API Key para integraciones o partners externos',
  })
  @ApiResponse({
    status: 201,
    description:
      'API Key generada con su valor en texto plano (mostrado solo una vez)',
  })
  createKey(@Body() dto: CreateApiKeyDto) {
    return this.apiKeysService.generateKey(dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'Lista todas las API Keys registradas (sin exponer el hash sensible)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Listado de API Keys activas y revocadas con sus prefijos y scopes',
  })
  listKeys() {
    return this.apiKeysService.listKeys();
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Revoca inmediatamente una API Key activa',
  })
  @ApiResponse({
    status: 200,
    description: 'API Key revocada exitosamente',
  })
  revokeKey(@Param('id') id: string) {
    return this.apiKeysService.revokeKey(id);
  }
}
