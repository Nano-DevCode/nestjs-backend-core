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
  };

  beforeEach(async () => {
    prismaMock = {
      discordGuildConfig: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
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
});
