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
    expect(service.getNodesStatus()).toEqual([]);
  });

  describe('registerNode without shoukaku initialized', () => {
    it('should return registered=false if shoukaku is not active', () => {
      const res = service.registerNode({
        name: 'node-test',
        host: 'localhost',
        port: 2333,
        password: 'pass',
      });
      expect(res.registered).toBe(false);
    });
  });

  describe('resolveTracks without shoukaku initialized', () => {
    it('should return error if service is not initialized', async () => {
      const requester: AudioTrackRequester = {
        id: 'user-1',
        username: 'User#1234',
      };
      const result = await service.resolveTracks('test song', requester);
      expect(result.loadType).toBe('error');
      expect(result.error).toContain('Servicio Lavalink no disponible');
    });
  });
});
