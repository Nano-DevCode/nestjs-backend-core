import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ExportsService } from './exports.service';
import { CreateExportRequestDto } from './dto/create-export-request.dto';
import type { ExportStatusRecord } from './exports.interfaces';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UserAuthContext } from '../auth/interfaces/auth.interface';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '../common/scalar/scalar.decorators';

@ApiTags('Data Exports')
@ApiBearerAuth('bearer-jwt')
@UseGuards(JwtAuthGuard)
@Controller('exports')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Solicita una exportación asíncrona masiva de datos (CSV, JSON, TSV) procesada en segundo plano con notificación WebSocket',
  })
  @ApiResponse({
    status: 202,
    description: 'Solicitud de exportación encolada exitosamente en BullMQ',
  })
  async requestExport(
    @CurrentUser() user: UserAuthContext,
    @Body() dto: CreateExportRequestDto,
  ): Promise<{ exportId: string; status: string; queueJobId?: string }> {
    return this.exportsService.requestExport(user.id, dto);
  }

  @Get(':exportId/status')
  @ApiOperation({
    summary: 'Consulta el estado de una exportación masiva y obtiene su enlace de descarga si ya finalizó',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado de la exportación obtenido exitosamente',
  })
  async getStatus(
    @Param('exportId') exportId: string,
  ): Promise<ExportStatusRecord> {
    const status = await this.exportsService.getExportStatus(exportId);
    if (!status) {
      throw new NotFoundException(
        `Exportación con ID '${exportId}' no encontrada o ya ha expirado`,
      );
    }
    return status;
  }
}

