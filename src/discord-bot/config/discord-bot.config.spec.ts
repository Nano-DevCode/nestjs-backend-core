import { loadDiscordBotConfig } from './discord-bot.config';

describe('loadDiscordBotConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should load default configuration when environment variables are unset', () => {
    delete process.env.DISCORD_BOT_ENABLED;
    delete process.env.DISCORD_BOT_TOKEN;
    delete process.env.LAVALINK_HOST;
    delete process.env.LAVALINK_PORT;

    const config = loadDiscordBotConfig();

    expect(config.isEnabled).toBe(false);
    expect(config.token).toBeUndefined();
    expect(config.lavalink.host).toBe('localhost');
    expect(config.lavalink.port).toBe(2333);
    expect(config.lavalink.password).toBe('youshallnotpass');
    expect(config.lavalink.secure).toBe(false);
  });

  it('should parse environment variables correctly when enabled', () => {
    process.env.DISCORD_BOT_ENABLED = 'true';
    process.env.DISCORD_BOT_TOKEN = 'discord-token-abc';
    process.env.DISCORD_CLIENT_ID = 'client-id-123';
    process.env.LAVALINK_HOST = 'custom-lava';
    process.env.LAVALINK_PORT = '9999';
    process.env.LAVALINK_PASSWORD = 'secret-password';
    process.env.LAVALINK_SECURE = 'true';
    process.env.SPOTIFY_CLIENT_ID = 'spotify-id';
    process.env.SPOTIFY_CLIENT_SECRET = 'spotify-sec';

    const config = loadDiscordBotConfig();

    expect(config.isEnabled).toBe(true);
    expect(config.token).toBe('discord-token-abc');
    expect(config.clientId).toBe('client-id-123');
    expect(config.lavalink.host).toBe('custom-lava');
    expect(config.lavalink.port).toBe(9999);
    expect(config.lavalink.password).toBe('secret-password');
    expect(config.lavalink.secure).toBe(true);
    expect(config.spotify?.clientId).toBe('spotify-id');
    expect(config.spotify?.clientSecret).toBe('spotify-sec');
  });

  it('should fallback to localhost if LAVALINK_HOST is "lavalink" and not running inside docker', () => {
    delete process.env.DOCKER_CONTAINER;
    process.env.LAVALINK_HOST = 'lavalink';

    const config = loadDiscordBotConfig();

    expect(config.lavalink.host).toBe('localhost');
  });
});

