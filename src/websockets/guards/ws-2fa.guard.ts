import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
import { REQUIRE_2FA_KEY } from '../../two-factor/decorators/require-2fa.decorator';
import { TwoFactorService } from '../../two-factor/two-factor.service';
import type { AuthenticatedSocket } from '../interfaces/authenticated-socket.interface';

@Injectable()
export class WsTwoFactorGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const require2FA = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_2FA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!require2FA) {
      return true;
    }

    const client = context.switchToWs().getClient<AuthenticatedSocket>();
    const user = client.data?.user ?? client.user;

    if (!user) {
      throw new WsException('Usuario no autenticado en el socket.');
    }

    // Si el usuario no tiene 2FA habilitado en su cuenta, permite el paso
    if (user.isTwoFactorEnabled === false) {
      return true;
    }

    // 1. Extraer código TOTP desde el payload del evento
    const data: unknown = context.switchToWs().getData();
    let code: string | undefined;

    if (typeof data === 'object' && data !== null) {
      const record = data as Record<string, unknown>;
      const candidate =
        record['code'] || record['totpCode'] || record['twoFactorCode'];
      if (typeof candidate === 'string') {
        code = candidate;
      }
    }

    // 2. Fallback: extraer código TOTP desde los headers del handshake del socket
    if (!code) {
      const headerCode = client.handshake?.headers?.['x-2fa-code'];
      code = Array.isArray(headerCode) ? headerCode[0] : headerCode;
    }

    if (!code || typeof code !== 'string' || !/^[0-9]{6}$/.test(code.trim())) {
      throw new WsException(
        'Step-Up 2FA Requerido: Debes proporcionar un código TOTP de 6 dígitos válido en el payload o header "x-2fa-code".',
      );
    }

    const isValid = await this.twoFactorService.verifyActionCode(
      user.id,
      code.trim(),
    );

    if (!isValid) {
      throw new WsException(
        'Código 2FA inválido o expirado para esta acción crítica de WebSocket.',
      );
    }

    return true;
  }
}
