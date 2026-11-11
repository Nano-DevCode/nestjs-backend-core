import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DiscordGuildService } from '../persistence/discord-guild.service';

interface RequestWithGuildAndUser {
  user?: {
    id: string;
    email?: string;
    roles?: string[];
  };
  params?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  query?: Record<string, string | undefined>;
}

@Injectable()
export class GuildAccessGuard implements CanActivate {
  constructor(private readonly guildService: DiscordGuildService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithGuildAndUser>();
    const user = req?.user;

    if (!user?.id) {
      throw new ForbiddenException(
        'No tienes permiso sobre este servidor de Discord',
      );
    }

    const roles = (user.roles || []).map((r) => r.toLowerCase());
    if (roles.includes('admin') || roles.includes('superadmin')) {
      return true;
    }

    const guildId =
      req.params?.guildId ||
      (typeof req.body?.guildId === 'string' ? req.body.guildId : undefined) ||
      (typeof req.query?.guildId === 'string' ? req.query.guildId : undefined);

    if (!guildId) {
      throw new BadRequestException(
        'Se requiere el identificador del servidor de Discord (guildId).',
      );
    }

    const hasAccess = await this.guildService.hasGuildAccess(
      user.id,
      guildId,
      user.roles,
    );

    if (!hasAccess) {
      throw new ForbiddenException(
        'No tienes permiso sobre este servidor de Discord',
      );
    }

    return true;
  }
}
