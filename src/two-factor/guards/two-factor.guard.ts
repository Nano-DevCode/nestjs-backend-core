import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { REQUIRE_2FA_KEY } from '../decorators/require-2fa.decorator';
import { TwoFactorService } from '../two-factor.service';

interface AuthenticatedUserWith2FA {
  id: string;
  email: string;
  isTwoFactorEnabled?: boolean;
}

interface RequestWithUser extends Request {
  user?: AuthenticatedUserWith2FA;
}

@Injectable()
export class TwoFactorGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const require2FA = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_2FA_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Si la ruta no está anotada con @Require2FA(), permite el paso
    if (!require2FA) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Usuario no autenticado.');
    }

    // Si el usuario no tiene 2FA habilitado, deja continuar
    if (user.isTwoFactorEnabled === false) {
      return true;
    }

    const rawCode = request.headers['x-2fa-code'];
    const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;

    if (!code || typeof code !== 'string' || !/^[0-9]{6}$/.test(code.trim())) {
      throw new UnauthorizedException(
        'Se requiere verificación 2FA válida para esta acción.',
      );
    }

    const isValid = await this.twoFactorService.verifyActionCode(
      user.id,
      code.trim(),
    );
    if (!isValid) {
      throw new UnauthorizedException(
        'Se requiere verificación 2FA válida para esta acción.',
      );
    }

    return true;
  }
}
