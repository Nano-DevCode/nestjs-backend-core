import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import * as crypto from 'crypto';
import { WebhooksService } from './webhooks.service';
import { WEBHOOKS_QUEUE } from './webhooks.constants';
import { REDIS_CLIENT } from '../redis/redis.constants';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let queueMock: {
    add: jest.Mock;
  };
  let redisMock: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
    sadd: jest.Mock;
    srem: jest.Mock;
    smembers: jest.Mock;
    pipeline: jest.Mock;
  };

  beforeEach(async () => {
    queueMock = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
    };

    redisMock = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(1),
      sadd: jest.fn().mockResolvedValue(1),
      srem: jest.fn().mockResolvedValue(1),
      smembers: jest.fn().mockResolvedValue([]),
      pipeline: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: getQueueToken(WEBHOOKS_QUEUE),
          useValue: queueMock,
        },
        {
          provide: REDIS_CLIENT,
          useValue: redisMock,
        },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('registerSubscription', () => {
    it('debe registrar una suscripción y generar un secreto aleatorio si no se provee', async () => {
      const sub = await service.registerSubscription({
        url: 'https://example.com/webhook',
        events: ['user.created', 'user.updated'],
      });

      expect(sub).toBeDefined();
      expect(sub.id).toBeDefined();
      expect(sub.url).toBe('https://example.com/webhook');
      expect(sub.events).toEqual(['user.created', 'user.updated']);
      expect(sub.secret).toHaveLength(64); // 32 bytes hex
      expect(sub.isActive).toBe(true);

      expect(redisMock.set).toHaveBeenCalledTimes(1);
      expect(redisMock.sadd).toHaveBeenCalledTimes(1);
    });

    it('debe respetar el secreto provisto por el usuario', async () => {
      const sub = await service.registerSubscription({
        url: 'https://example.com/webhook',
        events: ['*'],
        secret: 'mi-secreto-super-seguro-12345678',
        isActive: false,
      });

      expect(sub.secret).toBe('mi-secreto-super-seguro-12345678');
      expect(sub.isActive).toBe(false);
    });
  });

  describe('listSubscriptions', () => {
    it('debe retornar un arreglo vacío si no hay IDs registrados', async () => {
      redisMock.smembers.mockResolvedValue([]);
      const list = await service.listSubscriptions();
      expect(list).toEqual([]);
    });

    it('debe obtener y parsear suscripciones desde Redis', async () => {
      redisMock.smembers.mockResolvedValue(['sub-1', 'sub-2']);
      const sampleSub = {
        id: 'sub-1',
        url: 'https://webhook.site/1',
        events: ['*'],
        secret: 'sec-1',
        isActive: true,
      };

      const pipelineMock = {
        get: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, JSON.stringify(sampleSub)],
          [null, null],
        ]),
      };
      redisMock.pipeline.mockReturnValue(pipelineMock);

      const list = await service.listSubscriptions();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('sub-1');
    });
  });

  describe('getSubscription & deleteSubscription', () => {
    it('getSubscription debe retornar null si no existe', async () => {
      redisMock.get.mockResolvedValue(null);
      const sub = await service.getSubscription('inexistente');
      expect(sub).toBeNull();
    });

    it('getSubscription debe retornar la suscripción si existe', async () => {
      const mockSub = { id: 's1', url: 'https://a.com', events: ['*'] };
      redisMock.get.mockResolvedValue(JSON.stringify(mockSub));
      const sub = await service.getSubscription('s1');
      expect(sub).toEqual(mockSub);
    });

    it('deleteSubscription debe retornar true al eliminar correctamente', async () => {
      redisMock.del.mockResolvedValue(1);
      const res = await service.deleteSubscription('s1');
      expect(res).toBe(true);
      expect(redisMock.srem).toHaveBeenCalledWith(expect.any(String), 's1');
    });
  });

  describe('computeSignature', () => {
    it('debe calcular la firma HMAC-SHA256 esperada', () => {
      const payload = JSON.stringify({ hello: 'world' });
      const secret = 'test-secret';
      const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      const sig = service.computeSignature(payload, secret);
      expect(sig).toBe(expected);
    });
  });

  describe('dispatch', () => {
    it('debe retornar 0 encolados si no hay suscripciones coincidentes activas', async () => {
      jest.spyOn(service, 'listSubscriptions').mockResolvedValue([
        {
          id: 's1',
          url: 'https://test.com',
          secret: 'sec',
          events: ['order.completed'],
          isActive: true,
          createdAt: '',
        },
      ]);

      const res = await service.dispatch('user.created', { id: 1 });
      expect(res.queuedCount).toBe(0);
      expect(queueMock.add).not.toHaveBeenCalled();
    });

    it('debe encolar para suscripciones que coincidan con el evento o con comodín "*"', async () => {
      jest.spyOn(service, 'listSubscriptions').mockResolvedValue([
        {
          id: 's1',
          url: 'https://sub1.com',
          secret: 'sec1',
          events: ['user.created'],
          isActive: true,
          createdAt: '',
        },
        {
          id: 's2',
          url: 'https://sub2.com',
          secret: 'sec2',
          events: ['*'],
          isActive: true,
          createdAt: '',
        },
        {
          id: 's3',
          url: 'https://sub3.com',
          secret: 'sec3',
          events: ['user.created'],
          isActive: false, // inactivo, no debe despacharse
          createdAt: '',
        },
      ]);

      const res = await service.dispatch('user.created', { id: 99 });
      expect(res.queuedCount).toBe(2);
      expect(queueMock.add).toHaveBeenCalledTimes(2);
      expect(queueMock.add).toHaveBeenCalledWith(
        'webhook-dispatch-user.created',
        expect.objectContaining({
          event: 'user.created',
          targetUrl: 'https://sub1.com',
        }),
        expect.objectContaining({ attempts: 3 }),
      );
    });
  });
});

