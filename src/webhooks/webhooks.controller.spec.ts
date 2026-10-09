import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let service: WebhooksService;

  const mockWebhooksService = {
    registerSubscription: jest.fn(),
    listSubscriptions: jest.fn(),
    getSubscription: jest.fn(),
    deleteSubscription: jest.fn(),
    dispatch: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        {
          provide: WebhooksService,
          useValue: mockWebhooksService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WebhooksController>(WebhooksController);
    service = module.get<WebhooksService>(WebhooksService);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('createSubscription debe registrar una nueva suscripción', async () => {
    const mockCreated = { id: 'sub-1', url: 'https://test.com', events: ['*'] };
    mockWebhooksService.registerSubscription.mockResolvedValue(mockCreated);

    const result = await controller.createSubscription({
      url: 'https://test.com',
      events: ['*'],
    });

    expect(result).toEqual(mockCreated);
    expect(service.registerSubscription).toHaveBeenCalledTimes(1);
  });

  it('listSubscriptions debe retornar el listado', async () => {
    mockWebhooksService.listSubscriptions.mockResolvedValue([{ id: 'sub-1' }]);

    const result = await controller.listSubscriptions();
    expect(result).toEqual([{ id: 'sub-1' }]);
    expect(service.listSubscriptions).toHaveBeenCalledTimes(1);
  });

  it('getSubscription debe retornar suscripción existente o lanzar NotFoundException', async () => {
    mockWebhooksService.getSubscription.mockResolvedValueOnce({ id: 's1' });
    const res = await controller.getSubscription('s1');
    expect(res).toEqual({ id: 's1' });

    mockWebhooksService.getSubscription.mockResolvedValueOnce(null);
    await expect(controller.getSubscription('s2')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('deleteSubscription debe eliminar suscripción existente o lanzar NotFoundException', async () => {
    mockWebhooksService.deleteSubscription.mockResolvedValueOnce(true);
    const res = await controller.deleteSubscription('s1');
    expect(res.success).toBe(true);

    mockWebhooksService.deleteSubscription.mockResolvedValueOnce(false);
    await expect(controller.deleteSubscription('s2')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('dispatchTest debe encolar evento de prueba', async () => {
    mockWebhooksService.dispatch.mockResolvedValue({
      queuedCount: 1,
      jobIds: ['job-1'],
    });

    const res = await controller.dispatchTest({
      event: 'user.created',
      data: { id: 123 },
    });

    expect(res.queuedCount).toBe(1);
    expect(res.jobIds).toEqual(['job-1']);
    expect(service.dispatch).toHaveBeenCalledWith('user.created', { id: 123 });
  });
});

