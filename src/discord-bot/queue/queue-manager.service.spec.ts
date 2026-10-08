import { QueueManagerService } from './queue-manager.service';

describe('QueueManagerService', () => {
  let service: QueueManagerService;

  beforeEach(() => {
    service = new QueueManagerService();
  });

  describe('getOrCreateQueue y getQueue', () => {
    it('debe instanciar una nueva GuildQueue cuando no existe previamente', () => {
      const queue = service.getOrCreateQueue('guild-1', 'txt-1', 'vc-1');

      expect(queue).toBeDefined();
      expect(queue.guildId).toBe('guild-1');
      expect(queue.textChannelId).toBe('txt-1');
      expect(queue.voiceChannelId).toBe('vc-1');

      const retrieved = service.getQueue('guild-1');
      expect(retrieved).toBe(queue);
    });

    it('debe actualizar los canales de la cola existente si se llama de nuevo', () => {
      const q1 = service.getOrCreateQueue('guild-1', 'txt-1', 'vc-1');
      const q2 = service.getOrCreateQueue('guild-1', 'txt-updated', 'vc-updated');

      expect(q1).toBe(q2);
      expect(q2.textChannelId).toBe('txt-updated');
      expect(q2.voiceChannelId).toBe('vc-updated');
    });

    it('debe retornar undefined para una guild sin cola', () => {
      expect(service.getQueue('non-existent')).toBeUndefined();
    });
  });

  describe('deleteQueue', () => {
    it('debe eliminar la cola existente y retornar true', () => {
      service.getOrCreateQueue('guild-1', 'txt-1', 'vc-1');

      const deleted = service.deleteQueue('guild-1');
      expect(deleted).toBe(true);
      expect(service.getQueue('guild-1')).toBeUndefined();
    });

    it('debe retornar false si la cola a eliminar no existe', () => {
      expect(service.deleteQueue('non-existent')).toBe(false);
    });
  });

  describe('getAllActiveGuildIds y getAllQueues', () => {
    it('debe listar todos los guildIds y objetos de cola activos', () => {
      service.getOrCreateQueue('g-1', 't-1', 'v-1');
      service.getOrCreateQueue('g-2', 't-2', 'v-2');

      const ids = service.getAllActiveGuildIds();
      const allQueues = service.getAllQueues();

      expect(ids).toEqual(['g-1', 'g-2']);
      expect(allQueues).toHaveLength(2);
    });
  });
});
