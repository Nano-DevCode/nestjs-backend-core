import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { DiscordGateway } from '../gateway/discord.gateway';
import {
  DiscordGuildService,
  type UserGuildRole,
  type UserLavalinkRegistration,
} from '../persistence/discord-guild.service';

export interface DiscordOAuthUserProfile {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

export interface DiscordOAuthPartialGuild {
  id: string;
  name: string;
  icon?: string | null;
  owner?: boolean;
  permissions?: string;
}

export interface DiscordOAuthSyncResult {
  discordUser: DiscordOAuthUserProfile;
  linkedGuilds: UserLavalinkRegistration[];
  eligibleWithoutBot: Array<{
    id: string;
    name: string;
    role: UserGuildRole;
    inviteUrl: string | null;
  }>;
}

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const PERMISSION_ADMINISTRATOR = 0x8n; // 1 << 3
const PERMISSION_MANAGE_GUILD = 0x20n; // 1 << 5

@Injectable()
export class DiscordOAuthService {
  private readonly logger = new Logger(DiscordOAuthService.name);

  constructor(
    private readonly gateway: DiscordGateway,
    private readonly guildService: DiscordGuildService,
  ) {}

  private getClientId(): string {
    const client = this.gateway.getClient();
    return (
      process.env.DISCORD_CLIENT_ID ||
      client?.user?.id ||
      ''
    );
  }

  private getClientSecret(): string {
    return process.env.DISCORD_CLIENT_SECRET || '';
  }

  getRedirectUri(): string {
    if (process.env.DISCORD_OAUTH_REDIRECT_URI) {
      return process.env.DISCORD_OAUTH_REDIRECT_URI;
    }
    const baseAppUrl = (
      process.env.APP_URL ||
      process.env.FRONTEND_URL ||
      'https://sistema.nano-service.com'
    ).replace(/\/$/, '');
    return `${baseAppUrl}/api/v1/discord/oauth/callback`;
  }

  private getStateSecret(): string {
    return process.env.JWT_SECRET || 'super_secret_jwt_key';
  }

  /**
   * Genera un parámetro state firmado con HMAC-SHA256 que transporta de forma segura el userId.
   */
  createSignedState(userId: string, redirectPath = '/admin/discord-bot'): string {
    const payload = JSON.stringify({
      userId,
      redirectPath,
      exp: Date.now() + 15 * 60 * 1000, // 15 minutos
    });
    const encoded = Buffer.from(payload, 'utf8').toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.getStateSecret())
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${signature}`;
  }

  /**
   * Verifica la firma y expiración del parámetro state devuelto por Discord OAuth2.
   */
  verifySignedState(state: string): { userId: string; redirectPath: string } {
    if (!state || !state.includes('.')) {
      throw new UnauthorizedException('Parámetro state OAuth2 inválido.');
    }

    const [encoded, signature] = state.split('.');
    const expectedSig = crypto
      .createHmac('sha256', this.getStateSecret())
      .update(encoded)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (
      sigBuf.length !== expBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expBuf)
    ) {
      throw new UnauthorizedException('Firma de estado OAuth2 inválida.');
    }

    try {
      const parsed = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as { userId?: string; redirectPath?: string; exp?: number };

      if (!parsed.userId) {
        throw new UnauthorizedException('El estado OAuth2 no contiene userId.');
      }

      if (parsed.exp && Date.now() > parsed.exp) {
        throw new UnauthorizedException(
          'La sesión de vinculación de Discord ha expirado. Intenta nuevamente.',
        );
      }

      return {
        userId: parsed.userId,
        redirectPath: parsed.redirectPath || '/admin/discord-bot',
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('No se pudo decodificar el estado OAuth2.');
    }
  }

  /**
   * Construye la URL de autorización OAuth2 de Discord con scopes 'identify' y 'guilds'.
   */
  getAuthorizationUrl(userId: string, redirectPath?: string) {
    const clientId = this.getClientId();
    if (!clientId) {
      throw new BadRequestException(
        'DISCORD_CLIENT_ID no está configurado y el bot aún no reporta su Client ID.',
      );
    }

    const redirectUri = this.getRedirectUri();
    const state = this.createSignedState(userId, redirectPath);
    const scopes = encodeURIComponent('identify guilds');

    const authorizeUrl = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${encodeURIComponent(state)}&prompt=consent`;

    return {
      authorizeUrl,
      redirectUri,
      scopes: ['identify', 'guilds'],
      state,
    };
  }

  /**
   * Evalúa si el usuario tiene permisos de OWNER, ADMINISTRATOR (0x8) o MANAGE_GUILD (0x20)
   * en el servidor retornado por Discord OAuth2 (/users/@me/guilds).
   */
  resolveManageableRole(guild: DiscordOAuthPartialGuild): UserGuildRole | null {
    if (guild.owner) {
      return 'OWNER';
    }

    try {
      const permBits = BigInt(guild.permissions || '0');
      if ((permBits & PERMISSION_ADMINISTRATOR) === PERMISSION_ADMINISTRATOR) {
        return 'ADMINISTRATOR';
      }
      if ((permBits & PERMISSION_MANAGE_GUILD) === PERMISSION_MANAGE_GUILD) {
        return 'MANAGE_GUILD';
      }
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Intercambia un código de autorización OAuth2 por un access_token en Discord.
   */
  async exchangeCodeForToken(
    code: string,
    customRedirectUri?: string,
  ): Promise<string> {
    const clientId = this.getClientId();
    const clientSecret = this.getClientSecret();

    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'Faltan las variables DISCORD_CLIENT_ID o DISCORD_CLIENT_SECRET para completar el intercambio OAuth2 de Discord.',
      );
    }

    const redirectUri = customRedirectUri || this.getRedirectUri();
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      this.logger.warn(
        `Error en intercambio de token Discord OAuth2 (${response.status}): ${errorText}`,
      );
      throw new BadRequestException(
        `No se pudo intercambiar el código OAuth2 con Discord (HTTP ${response.status}). Verifica que el Redirect URI (${redirectUri}) esté registrado en el Discord Developer Portal.`,
      );
    }

    const tokenData = (await response.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      throw new BadRequestException(
        'Discord no devolvió un access_token válido.',
      );
    }

    return tokenData.access_token;
  }

  /**
   * Consulta a la API de Discord la identidad del usuario (/users/@me) y sus servidores (/users/@me/guilds).
   */
  async fetchDiscordIdentityAndGuilds(accessToken: string): Promise<{
    profile: DiscordOAuthUserProfile;
    guilds: DiscordOAuthPartialGuild[];
  }> {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };

    const [userRes, guildsRes] = await Promise.all([
      fetch(`${DISCORD_API_BASE}/users/@me`, { headers }),
      fetch(`${DISCORD_API_BASE}/users/@me/guilds`, { headers }),
    ]);

    if (!userRes.ok) {
      throw new UnauthorizedException(
        `Token de Discord inválido al consultar /users/@me (HTTP ${userRes.status}).`,
      );
    }

    if (!guildsRes.ok) {
      throw new BadRequestException(
        `No se pudieron obtener los servidores de Discord del usuario (HTTP ${guildsRes.status}). Asegúrate de autorizar el scope "guilds".`,
      );
    }

    const profile = (await userRes.json()) as DiscordOAuthUserProfile;
    const guilds = (await guildsRes.json()) as DiscordOAuthPartialGuild[];

    return { profile, guilds };
  }

  /**
   * Sincroniza la cuenta de Discord del usuario mediante código OAuth2 o accessToken:
   * 1. Guarda su discordUserId en la base de datos.
   * 2. Filtra únicamente los servidores donde tiene OWNER, ADMINISTRATOR (0x8) o MANAGE_GUILD (0x20).
   * 3. Cruza con client.guilds.cache para vincular automáticamente aquellos donde el bot está presente.
   */
  async syncUserGuildsFromOAuth(
    userId: string,
    params: {
      code?: string;
      accessToken?: string;
      redirectUri?: string;
    },
  ): Promise<DiscordOAuthSyncResult> {
    let token = params.accessToken;
    if (!token && params.code) {
      token = await this.exchangeCodeForToken(params.code, params.redirectUri);
    }

    if (!token) {
      throw new BadRequestException(
        'Se requiere "code" o "accessToken" de Discord OAuth2 para sincronizar los servidores.',
      );
    }

    const { profile, guilds } = await this.fetchDiscordIdentityAndGuilds(token);

    await this.guildService.saveUserDiscordId(userId, profile.id, {
      id: profile.id,
      username: profile.username,
      globalName: profile.global_name ?? null,
      avatar: profile.avatar ?? null,
      syncedAt: new Date().toISOString(),
    });

    const client = this.gateway.getClient();
    const botClientId = this.getClientId();

    const verifiedWithBot: Array<{
      guildId: string;
      guildName: string;
      role: UserGuildRole;
      voiceChannelId?: string | null;
    }> = [];

    const eligibleWithoutBot: Array<{
      id: string;
      name: string;
      role: UserGuildRole;
      inviteUrl: string | null;
    }> = [];

    for (const userGuild of guilds) {
      const role = this.resolveManageableRole(userGuild);
      if (!role) {
        continue;
      }

      const botGuild = client?.guilds.cache.get(userGuild.id);
      if (botGuild) {
        const activeVoiceChannelId =
          botGuild.voiceStates?.cache?.get(profile.id)?.channelId ?? null;

        verifiedWithBot.push({
          guildId: botGuild.id,
          guildName: botGuild.name || userGuild.name,
          role,
          voiceChannelId: activeVoiceChannelId,
        });
      } else {
        eligibleWithoutBot.push({
          id: userGuild.id,
          name: userGuild.name,
          role,
          inviteUrl: botClientId
            ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(botClientId)}&permissions=36700160&scope=bot%20applications.commands&guild_id=${encodeURIComponent(userGuild.id)}&disable_guild_select=true`
            : null,
        });
      }
    }

    const linkedGuilds = await this.guildService.syncOAuthGuilds(
      userId,
      profile.id,
      verifiedWithBot,
    );

    this.logger.log(
      `[DiscordOAuthService] Usuario [${userId}] (Discord ID: ${profile.id}) sincronizó ${linkedGuilds.length} servidores con el bot presente.`,
    );

    return {
      discordUser: profile,
      linkedGuilds,
      eligibleWithoutBot,
    };
  }
}
