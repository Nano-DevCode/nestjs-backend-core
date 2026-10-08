import { z } from 'zod';

export const discordBotConfigSchema = z.object({
  isEnabled: z.boolean().default(false),
  token: z.string().optional(),
  clientId: z.string().optional(),
  lavalink: z.object({
    name: z.string().default('main-node'),
    host: z.string().default('localhost'),
    port: z.number().default(2333),
    password: z.string().default('youshallnotpass'),
    secure: z.boolean().default(false),
  }),
  spotify: z
    .object({
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
    })
    .optional(),
});

export type DiscordBotConfig = z.infer<typeof discordBotConfigSchema>;

export function loadDiscordBotConfig(): DiscordBotConfig {
  const isEnabled = process.env.DISCORD_BOT_ENABLED === 'true';

  const rawConfig = {
    isEnabled,
    token: process.env.DISCORD_BOT_TOKEN || undefined,
    clientId: process.env.DISCORD_CLIENT_ID || undefined,
    lavalink: {
      name: 'lavalink-node-1',
      host:
        process.env.LAVALINK_HOST === 'lavalink' && !process.env.DOCKER_CONTAINER
          ? 'localhost'
          : process.env.LAVALINK_HOST || 'localhost',
      port: Number(process.env.LAVALINK_PORT) || 2333,
      password: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
      secure: process.env.LAVALINK_SECURE === 'true',
    },
    spotify: {
      clientId: process.env.SPOTIFY_CLIENT_ID || undefined,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET || undefined,
    },
  };

  return discordBotConfigSchema.parse(rawConfig);
}
