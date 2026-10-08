import { DiscordBotWsGateway } from './discord-bot-ws.gateway';
import type { Socket } from 'socket.io';

describe('DiscordBotWsGateway', () => {
  let gateway: DiscordBotWsGateway;
  let mockServer: any;
  let mockSocket: any;

  beforeEach(() => {
    gateway = new DiscordBotWsGateway();

    const mockNamespace = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      on: jest.fn(),
    };

    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      of: jest.fn().mockReturnValue(mockNamespace),
    };

    gateway.server = mockServer;

    mockSocket = {
      id: 'socket-discord-1',
      join: jest.fn(),
      leave: jest.fn(),
    } as unknown as Socket;
  });

  describe('afterInit', () => {
    it('should initialize gateway namespace without error', () => {
      expect(() => gateway.afterInit(mockServer)).not.toThrow();
      expect(mockServer.of).toHaveBeenCalledWith('/realtime/discord-bot');
    });
  });

  describe('handleConnection & handleDisconnect', () => {
    it('should handle connection and disconnection cleanly', () => {
      expect(() => gateway.handleConnection(mockSocket)).not.toThrow();
      expect(() => gateway.handleDisconnect(mockSocket)).not.toThrow();
    });
  });

  describe('handleJoinGuildRoom', () => {
    it('should join guild room when guildId is provided in object', () => {
      const res = gateway.handleJoinGuildRoom(mockSocket, { guildId: 'guild-abc' });

      expect(mockSocket.join).toHaveBeenCalledWith('guild-abc');
      expect(res).toEqual({ event: 'joined', guildId: 'guild-abc' });
    });

    it('should join guild room when guildId is provided as string', () => {
      const res = gateway.handleJoinGuildRoom(mockSocket, 'guild-xyz');

      expect(mockSocket.join).toHaveBeenCalledWith('guild-xyz');
      expect(res).toEqual({ event: 'joined', guildId: 'guild-xyz' });
    });

    it('should return error if guildId is missing', () => {
      const res = gateway.handleJoinGuildRoom(mockSocket, {} as any);

      expect(mockSocket.join).not.toHaveBeenCalled();
      expect(res).toEqual({ event: 'error', message: 'guildId requerido' });
    });
  });

  describe('handleLeaveGuildRoom', () => {
    it('should leave guild room when guildId is provided in object', () => {
      const res = gateway.handleLeaveGuildRoom(mockSocket, { guildId: 'guild-abc' });

      expect(mockSocket.leave).toHaveBeenCalledWith('guild-abc');
      expect(res).toEqual({ event: 'left', guildId: 'guild-abc' });
    });

    it('should leave guild room when guildId is provided as string', () => {
      const res = gateway.handleLeaveGuildRoom(mockSocket, 'guild-xyz');

      expect(mockSocket.leave).toHaveBeenCalledWith('guild-xyz');
      expect(res).toEqual({ event: 'left', guildId: 'guild-xyz' });
    });

    it('should return error if guildId is missing', () => {
      const res = gateway.handleLeaveGuildRoom(mockSocket, {} as any);

      expect(mockSocket.leave).not.toHaveBeenCalled();
      expect(res).toEqual({ event: 'error', message: 'guildId requerido' });
    });
  });

  describe('emit events', () => {
    it('should emit queue updated to guild room', () => {
      const queueData = { tracks: [] };
      gateway.emitQueueUpdated('guild-1', queueData);

      expect(mockServer.to).toHaveBeenCalledWith('guild-1');
      expect(mockServer.emit).toHaveBeenCalledWith('discord:queue-updated', queueData);
    });

    it('should emit track start to guild room', () => {
      const trackData = { track: { info: { title: 'Song' } } };
      gateway.emitTrackStart('guild-1', trackData);

      expect(mockServer.to).toHaveBeenCalledWith('guild-1');
      expect(mockServer.emit).toHaveBeenCalledWith('discord:track-start', trackData);
    });

    it('should emit playback state to guild room', () => {
      const state = { isPaused: false, volume: 100, status: 'playing' };
      gateway.emitPlaybackState('guild-1', state);

      expect(mockServer.to).toHaveBeenCalledWith('guild-1');
      expect(mockServer.emit).toHaveBeenCalledWith('discord:playback-state', state);
    });

    it('should emit track progress to guild room', () => {
      const progress = { guildId: 'guild-1', position: 1500, duration: 3000, isPaused: false };
      gateway.emitTrackProgress('guild-1', progress);

      expect(mockServer.to).toHaveBeenCalledWith('guild-1');
      expect(mockServer.emit).toHaveBeenCalledWith('discord:track-progress', progress);
    });

    it('should do nothing gracefully if server is null', () => {
      gateway.server = null as any;
      expect(() => gateway.emitQueueUpdated('guild-1', {})).not.toThrow();
      expect(() => gateway.emitTrackStart('guild-1', {})).not.toThrow();
      expect(() => gateway.emitPlaybackState('guild-1', {} as any)).not.toThrow();
      expect(() => gateway.emitTrackProgress('guild-1', {} as any)).not.toThrow();
    });
  });
});

