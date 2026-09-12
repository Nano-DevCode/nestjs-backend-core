import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { UserAuthContext } from '../../auth/interfaces/auth.interface';

interface AuthenticatedRequest extends Request {
  user?: UserAuthContext;
}

export const CurrentUser = createParamDecorator(
  (
    data: keyof UserAuthContext | undefined,
    ctx: ExecutionContext,
  ): UserAuthContext | UserAuthContext[keyof UserAuthContext] => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new InternalServerErrorException(
        'CurrentUserDecorator: request.user no está definido. Asegúrate de proteger la ruta con JwtAuthGuard antes de usar este decorador.',
      );
    }

    return data ? user[data] : user;
  },
);
