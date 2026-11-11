import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '../common/scalar/scalar.decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, Public } from '../auth/decorators/auth.decorator';
import { LogsService } from './logs.service';
import { ClientLogDto } from './dto/create-log.dto';
import { LogQueryDto } from './dto/log-query.dto';
import type { UserAuthContext } from '../auth/interfaces/auth.interface';

interface AuthenticatedRequest extends Request {
  user?: UserAuthContext;
}

@ApiTags('System Logs')
@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Post('client')
  @Public()
  @Throttle({
    short: { limit: 5, ttl: 5000 },
    long: { limit: 30, ttl: 60000 },
  })
  @ApiOperation({
    summary:
      'Registra errores del cliente frontend (protegido por rate-limiting estricto)',
  })
  @ApiResponse({
    status: 201,
    description: 'Log del cliente recibido y puesto en cola asíncrona',
  })
  reportClientLog(@Body() dto: ClientLogDto, @Req() req: AuthenticatedRequest) {
    const fallbackUserId = req.user?.id;
    this.logsService.enqueueClientLog(dto, fallbackUserId);
    return {
      success: true,
      message: 'Log registrado y encolado correctamente',
    };
  }

  @Get()
  @ApiBearerAuth('bearer-jwt')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  @ApiOperation({
    summary:
      'Consulta paginada y filtrada de logs del sistema (exclusivo administradores)',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado paginado de logs del sistema',
  })
  getLogs(@Query() query: LogQueryDto) {
    return this.logsService.getLogs(query);
  }

  @Get('stats')
  @ApiBearerAuth('bearer-jwt')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  @ApiOperation({
    summary:
      'Métricas agregadas de las últimas 24 horas para el visor interactivo',
  })
  @ApiResponse({
    status: 200,
    description: 'Métricas de fallos, distribución y top de contextos',
  })
  getStats() {
    return this.logsService.getStats();
  }
}
