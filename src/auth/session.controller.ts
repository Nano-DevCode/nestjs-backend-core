import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '../common/scalar/scalar.decorators';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UserAuthContext } from './interfaces/auth.interface';
import { SessionService, type UserSessionInfo } from './session.service';

@ApiTags('Auth Sessions')
@ApiBearerAuth('bearer-jwt')
@UseGuards(JwtAuthGuard)
@Controller('auth/sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get()
  @ApiOperation({
    summary:
      'Obtiene todas las sesiones y dispositivos activos de la cuenta del usuario autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de sesiones y dispositivos activos obtenida exitosamente',
  })
  async getActiveSessions(
    @CurrentUser() user: UserAuthContext,
    @Req() req: Request,
  ): Promise<UserSessionInfo[]> {
    const currentJti = (req.user as { jti?: string })?.jti;
    return this.sessionService.getUserSessions(user.id, currentJti);
  }

  @Delete('other/all')
  @ApiOperation({
    summary:
      'Cierra todas las sesiones activas en otros dispositivos, manteniendo únicamente la sesión actual',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesiones remotas revocadas exitosamente',
  })
  async revokeOtherSessions(
    @CurrentUser() user: UserAuthContext,
    @Req() req: Request,
  ): Promise<{ message: string; revokedCount: number }> {
    const currentJti = (req.user as { jti?: string })?.jti || '';
    const revokedCount = await this.sessionService.revokeOtherUserSessions(
      user.id,
      currentJti,
    );
    return {
      message: `Se han cerrado ${revokedCount} sesión(es) en otros dispositivos.`,
      revokedCount,
    };
  }

  @Delete(':sessionId')
  @ApiOperation({
    summary: 'Cierra y revoca una sesión de dispositivo específica por su ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesión revocada exitosamente',
  })
  async revokeSession(
    @CurrentUser() user: UserAuthContext,
    @Param('sessionId') sessionId: string,
  ): Promise<{ message: string }> {
    await this.sessionService.revokeSession(user.id, sessionId);
    await this.sessionService.blacklistToken(sessionId, 86400 * 7);
    return {
      message: `Sesión '${sessionId}' cerrada y revocada exitosamente.`,
    };
  }
}

