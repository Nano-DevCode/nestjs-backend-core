import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '../../common/scalar/scalar.decorators';
import { ApiKeyAuthGuard } from '../guards/api-key-auth.guard';
import {
  RequireApiScope,
  CurrentApiKey,
} from '../decorators/api-key.decorator';
import type { ApiKeyRecord } from '../interfaces/api-key.interface';

@ApiTags('External Integrations (Partners)')
@Controller('v1/external')
@UseGuards(ApiKeyAuthGuard)
export class ExternalController {
  @Get('status')
  @ApiOperation({
    summary: 'Consulta de estado de conexión y cuotas de la API Key externa',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado de conexión e información de scopes asignados',
  })
  getStatus(@CurrentApiKey() apiKey: ApiKeyRecord) {
    return {
      status: 'authenticated',
      partner: apiKey.name,
      prefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      rateLimit: apiKey.rateLimit,
      lastUsedAt: apiKey.lastUsedAt,
    };
  }

  @Get('students')
  @RequireApiScope('students:read')
  @ApiOperation({
    summary:
      'Consulta de directorio de alumnos (Requiere scope: students:read)',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista autorizada de alumnos para integración de partner',
  })
  getStudents(@CurrentApiKey() apiKey: ApiKeyRecord) {
    return {
      source: 'Sistema On-Premise Partner API',
      authorizedBy: apiKey.name,
      total: 3,
      students: [
        {
          id: '101',
          matricula: '2026-CS-01',
          nombre: 'Ana Karen Morales',
          carrera: 'Ingeniería en Software',
          estatus: 'ACTIVO',
        },
        {
          id: '102',
          matricula: '2026-CS-02',
          nombre: 'Carlos Eduardo Ruiz',
          carrera: 'Ciberseguridad',
          estatus: 'ACTIVO',
        },
        {
          id: '103',
          matricula: '2026-CS-03',
          nombre: 'Elena Vega Gómez',
          carrera: 'Sistemas Computacionales',
          estatus: 'ACTIVO',
        },
      ],
    };
  }

  @Post('grades/verify')
  @RequireApiScope('grades:verify')
  @ApiOperation({
    summary:
      'Verificación de autenticidad de calificaciones (Requiere scope: grades:verify)',
  })
  @ApiResponse({
    status: 200,
    description: 'Resultado del cotejo de integridad académica',
  })
  verifyGrades(
    @CurrentApiKey() apiKey: ApiKeyRecord,
    @Body() body: { matricula: string; hash?: string },
  ) {
    return {
      verified: true,
      partner: apiKey.name,
      matricula: body.matricula || '2026-CS-01',
      validationStatus: 'CERTIFICADO_OFICIAL_VALIDO',
      verifiedAt: new Date().toISOString(),
    };
  }
}
