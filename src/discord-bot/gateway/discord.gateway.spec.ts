import { DiscordGateway } from './discord.gateway';
import { LavalinkService } from '../audio/lavalink.service';
import { CommandRegistryService } from '../commands/command-registry.service';
import { DiscordGuildService } from '../persistence/discord-guild.service';
import { DiscordPlaybackService } from '../audio/discord-playback.service';

describe('DiscordGateway', () => {
  let gateway: DiscordGateway;
  let mockLavalinkService: jest.Mocked<LavalinkService>;
  let mockCommandRegistry: jest.Mocked<CommandRegistryService>;
  let mockGuildService: jest.Mocked<DiscordGuildService>;
  let mockPlaybackService: jest.Mocked<DiscordPlaybackService>;

  beforeEach(() => {
    mockLavalinkService = {
      init: jest.fn(),
      resolveTracks: jest.fn(),
    } as unknown as jest.Mocked<LavalinkService>;

    mockCommandRegistry = {
      dispatch: jest.fn(),
    } as unknown as jest.Mocked<CommandRegistryService>;

    mockGuildService = {
      ensureGuildConfig: jest.fn(),
      getGuildConfig: jest.fn(),
    } as unknown as jest.Mocked<DiscordGuildService>;

    mockPlaybackService = {
      playTracks: jest.fn(),
    } as unknown as jest.Mocked<DiscordPlaybackService>;
  });

  describe('when bot is disabled', () => {
    beforeEach(() => {
      delete process.env.DISCORD_BOT_ENABLED;
      gateway = new DiscordGateway(
        mockLavalinkService,
        mockCommandRegistry,
        mockGuildService,
        mockPlaybackService,
      );
    });

    it('should skip connection onModuleInit if disabled', async () => {
      await gateway.onModuleInit();

      expect(gateway.getClient()).toBeNull();
      expect(mockLavalinkService.init).not.toHaveBeenCalled();
    });

    it('should handle onModuleDestroy gracefully when client is null', async () => {
      await expect(gateway.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  describe('when bot is enabled but token is missing', () => {
    beforeEach(() => {
      process.env.DISCORD_BOT_ENABLED = 'true';
      delete process.env.DISCORD_BOT_TOKEN;

      gateway = new DiscordGateway(
        mockLavalinkService,
        mockCommandRegistry,
        mockGuildService,
        mockPlaybackService,
      );
    });

    afterEach(() => {
      delete process.env.DISCORD_BOT_ENABLED;
    });

    it('should skip login if token is missing', async () => {
      await gateway.onModuleInit();

      expect(gateway.getClient()).toBeNull();
      expect(mockLavalinkService.init).not.toHaveBeenCalled();
    });
  });

  describe('when bot is enabled with token', () => {
    let mockClientInstance: any;

    beforeEach(() => {
      process.env.DISCORD_BOT_ENABLED = 'true';
      process.env.DISCORD_BOT_TOKEN = 'mock-discord-token';

      gateway = new DiscordGateway(
        mockLavalinkService,
        mockCommandRegistry,
        mockGuildService,
        mockPlaybackService,
      );

      mockClientInstance = {
        login: jest.fn().mockResolvedValue('mock-discord-token'),
        destroy: jest.fn().mockResolvedValue(undefined),
        once: jest.fn(),
        on: jest.fn(),
      };

      (gateway as any).client = mockClientInstance;
    });

    afterEach(() => {
      delete process.env.DISCORD_BOT_ENABLED;
      delete process.env.DISCORD_BOT_TOKEN;
    });

    it('should destroy client onModuleDestroy', async () => {
      await gateway.onModuleDestroy();

      expect(mockClientInstance.destroy).toHaveBeenCalled();
      expect(gateway.getClient()).toBeNull();
    });
  });
});

