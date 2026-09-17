import { Test, TestingModule } from '@nestjs/testing';
import { LavalinkService } from './lavalink.service';
import type { AudioTrackRequester } from '../queue/guild-queue.model';

describe('LavalinkService', () => {
  let service: LavalinkService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LavalinkService],
    }).compile();

    service = module.get<LavalinkService>(LavalinkService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(service.isConnected).toBe(false);
  });

  describe('resolveTracks without shoukaku initialized', () => {
    it('should return error if service is not initialized', async () => {
      const requester: AudioTrackRequester = {
        id: 'user-1',
        tag: 'User#1234',
        displayName: 'User',
      };
      const result = await service.resolveTracks('test song', requester);
      expect(result.loadType).toBe('error');
      expect(result.error).toContain('Servicio Lavalink no disponible');
    });
  });
});

