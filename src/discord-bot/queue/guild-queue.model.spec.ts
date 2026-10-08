import { GuildQueue, AudioTrack } from './guild-queue.model';

describe('GuildQueue Model', () => {
  let queue: GuildQueue;

  const createMockTrack = (id: string, title: string): AudioTrack => ({
    encoded: `enc-${id}`,
    info: {
      identifier: id,
      isSeekable: true,
      author: 'Author',
      length: 180000,
      isStream: false,
      position: 0,
      title,
      sourceName: 'youtube',
    },
    requester: {
      id: 'req-1',
      username: 'User1',
    },
  });

  beforeEach(() => {
    queue = new GuildQueue('guild-123', 'text-ch-1', 'voice-ch-1');
  });

  describe('addTrack and addTracks', () => {
    it('debe agregar una pista a la lista de reproducción', () => {
      const track = createMockTrack('track-1', 'Song 1');
      queue.addTrack(track);

      expect(queue.tracks).toHaveLength(1);
      expect(queue.tracks[0]).toEqual(track);
    });

    it('debe agregar múltiples pistas concurrentemente', () => {
      const tracks = [
        createMockTrack('t-1', 'Song 1'),
        createMockTrack('t-2', 'Song 2'),
      ];
      queue.addTracks(tracks);

      expect(queue.tracks).toHaveLength(2);
    });
  });

  describe('getNextTrack', () => {
    it('debe avanzar a la siguiente pista y guardar la actual en el historial cuando repeatMode es off', () => {
      const t1 = createMockTrack('t-1', 'Track 1');
      const t2 = createMockTrack('t-2', 'Track 2');
      queue.addTracks([t1, t2]);

      const first = queue.getNextTrack();
      expect(first).toEqual(t1);
      expect(queue.currentTrack).toEqual(t1);
      expect(queue.history).toHaveLength(0);

      const second = queue.getNextTrack();
      expect(second).toEqual(t2);
      expect(queue.history[0]).toEqual(t1);
    });

    it('debe repetir la misma pista si repeatMode es track', () => {
      const t1 = createMockTrack('t-1', 'Track 1');
      queue.addTrack(t1);
      queue.getNextTrack();

      queue.repeatMode = 'track';
      const repeated = queue.getNextTrack();

      expect(repeated).toEqual(t1);
      expect(queue.currentTrack).toEqual(t1);
    });

    it('debe reencolar la pista al final si repeatMode es queue', () => {
      const t1 = createMockTrack('t-1', 'Track 1');
      const t2 = createMockTrack('t-2', 'Track 2');
      queue.addTracks([t1, t2]);

      queue.repeatMode = 'queue';
      queue.getNextTrack(); // currentTrack = t1
      queue.getNextTrack(); // currentTrack = t2, t1 fue agregado al final

      expect(queue.tracks).toHaveLength(1);
      expect(queue.tracks[0]).toEqual(t1);
    });
  });

  describe('getPreviousTrack', () => {
    it('debe retornar null si no hay canciones previas en el historial', () => {
      expect(queue.getPreviousTrack()).toBeNull();
    });

    it('debe recuperar la canción anterior del historial y poner la actual al frente', () => {
      const t1 = createMockTrack('t-1', 'Track 1');
      const t2 = createMockTrack('t-2', 'Track 2');
      queue.addTracks([t1, t2]);
      queue.getNextTrack();
      queue.getNextTrack(); // t1 ahora está en history

      const prev = queue.getPreviousTrack();
      expect(prev).toEqual(t1);
      expect(queue.currentTrack).toEqual(t1);
      expect(queue.tracks[0]).toEqual(t2);
    });
  });

  describe('removeTrack and clearQueue', () => {
    it('debe remover la canción en el índice indicado', () => {
      const t1 = createMockTrack('t-1', 'Track 1');
      const t2 = createMockTrack('t-2', 'Track 2');
      queue.addTracks([t1, t2]);

      const removed = queue.removeTrack(0);
      expect(removed).toEqual(t1);
      expect(queue.tracks).toHaveLength(1);
      expect(queue.tracks[0]).toEqual(t2);
    });

    it('debe retornar null si el índice está fuera de rango', () => {
      expect(queue.removeTrack(-1)).toBeNull();
      expect(queue.removeTrack(10)).toBeNull();
    });

    it('debe vaciar la cola y retornar el conteo eliminado', () => {
      queue.addTracks([
        createMockTrack('t-1', 'T1'),
        createMockTrack('t-2', 'T2'),
      ]);

      const clearedCount = queue.clearQueue();
      expect(clearedCount).toBe(2);
      expect(queue.tracks).toHaveLength(0);
    });
  });

  describe('toJSON', () => {
    it('debe serializar el estado de la cola para WebSockets o REST', () => {
      const json = queue.toJSON();
      expect(json.guildId).toBe('guild-123');
      expect(json.queueLength).toBe(0);
      expect(json.volume).toBe(100);
      expect(json.repeatMode).toBe('off');
    });
  });
});
