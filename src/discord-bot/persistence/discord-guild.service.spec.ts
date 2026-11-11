import { Test, TestingModule } from '@nestjs/testing';
import { DiscordGuildService } from './discord-guild.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('DiscordGuildService', () => {
  let service: DiscordGuildService;
  let prismaMock: {
    discordGuildConfig: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
    oAuthAccount: {
      upsert: jest.Mock;
      findMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      discordGuildConfig: {
        findUnique: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ guildId: 'g-123' }),
      },
      oAuthAccount: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordGuildService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<DiscordGuildService>(DiscordGuildService);
  });

  describe('getGuildConfig', () => {
    it('debe obtener la configuración del servidor por guildId', async () => {
      const mockConfig = { guildId: 'g-123', prefix: '/', defaultVolume: 100 };
      prismaMock.discordGuildConfig.findUnique.mockResolvedValue(mockConfig);

      const result = await service.getGuildConfig('g-123');

      expect(prismaMock.discordGuildConfig.findUnique).toHaveBeenCalledWith({
        where: { guildId: 'g-123' },
      });
      expect(result).toEqual(mockConfig);
    });
  });

  describe('ensureGuildConfig', () => {
    it('debe ejecutar upsert para asegurar existencia de configuración con valores por defecto', async () => {
      const mockUpsertResult = { guildId: 'g-123', name: 'My Guild' };
      prismaMock.discordGuildConfig.upsert.mockResolvedValue(mockUpsertResult);

      const result = await service.ensureGuildConfig('g-123', 'My Guild');

      expect(prismaMock.discordGuildConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { guildId: 'g-123' },
          create: expect.objectContaining({
            guildId: 'g-123',
            name: 'My Guild',
            prefix: '/',
            defaultVolume: 100,
          }),
        }),
      );
      expect(result).toEqual(mockUpsertResult);
    });
  });

  describe('updateGuildConfig', () => {
    it('debe actualizar los parámetros modificados mediante upsert', async () => {
      prismaMock.discordGuildConfig.upsert.mockResolvedValue({
        guildId: 'g-123',
        defaultVolume: 80,
        dedicatedChannelId: 'chan-1',
      });

      const result = await service.updateGuildConfig('g-123', {
        defaultVolume: 80,
        dedicatedChannelId: 'chan-1',
      });

      expect(prismaMock.discordGuildConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { guildId: 'g-123' },
          update: expect.objectContaining({
            defaultVolume: 80,
            dedicatedChannelId: 'chan-1',
          }),
        }),
      );
      expect(result.defaultVolume).toBe(80);
    });
  });

  describe('registerUserLavalinkSession & getUserRegistrations', () => {
    it('debe registrar y recuperar la sesión de Lavalink de un usuario', async () => {
      const reg = await service.registerUserLavalinkSession('user-1', {
        guildId: 'g-123',
        guildName: 'Music Server',
        voiceChannelId: 'vc-1',
        discordUserId: 'disc-99',
      });

      expect(reg.userId).toBe('user-1');
      expect(reg.guildId).toBe('g-123');
      expect(reg.voiceChannelId).toBe('vc-1');
      expect(prismaMock.oAuthAccount.upsert).toHaveBeenCalled();

      const list = await service.getUserRegistrations('user-1');
      expect(list).toHaveLength(1);
      expect(list[0].guildId).toBe('g-123');
    });

    it('debe desvincular el servidor del usuario con unregisterUserGuild', async () => {
      await service.registerUserLavalinkSession('user-1', {
        guildId: 'g-123',
      });

      const removed = await service.unregisterUserGuild('user-1', 'g-123');
      expect(removed).toBe(true);
    });
  });
});
