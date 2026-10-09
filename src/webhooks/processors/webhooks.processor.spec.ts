import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import * as crypto from 'crypto';
import { WebhooksProcessor } from './webhooks.processor';
import type { WebhookJobData } from '../webhooks.interfaces';

describe('WebhooksProcessor', () => {
  let processor: WebhooksProcessor;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [WebhooksProcessor],
    }).compile();

    processor = module.get<WebhooksProcessor>(WebhooksProcessor);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('debe estar definido', () => {
    expect(processor).toBeDefined();
  });

  it('debe procesar el job con éxito y enviar firma HMAC-SHA256 válida', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('ok'),
    });

    const mockJobData: WebhookJobData = {
      deliveryId: 'deliv-1',
      subscriptionId: 'sub-1',
      targetUrl: 'https://webhook.site/endpoint',
      secret: 'secret-key-123',
      event: 'user.created',
      payload: {
        id: 'deliv-1',
        event: 'user.created',
        timestamp: '2026-10-09T00:00:00.000Z',
        data: { userId: 'u-123' },
      },
    };

    const mockJob = {
      id: 'job-1',
      data: mockJobData,
      attemptsMade: 0,
    } as unknown as Job<WebhookJobData, { statusCode: number; durationMs: number }, string>;

    const result = await processor.process(mockJob);

    expect(result.statusCode).toBe(200);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://webhook.site/endpoint');
    expect(options.method).toBe('POST');

    // Comprobar la firma HMAC
    const expectedSignature = crypto
      .createHmac('sha256', 'secret-key-123')
      .update(JSON.stringify(mockJobData.payload))
      .digest('hex');

    expect(options.headers['X-Webhook-Signature-256']).toBe(expectedSignature);
    expect(options.headers['X-Webhook-Event']).toBe('user.created');
    expect(options.headers['X-Webhook-Delivery-Id']).toBe('deliv-1');
  });

  it('debe lanzar error cuando el servidor destino responde con código de error HTTP (>=400)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('Internal Server Error'),
    });

    const mockJob = {
      id: 'job-err',
      data: {
        deliveryId: 'd-1',
        subscriptionId: 's-1',
        targetUrl: 'https://failing-api.com',
        secret: 'sec',
        event: 'test',
        payload: { id: 'd-1', event: 'test', timestamp: '', data: {} },
      },
      attemptsMade: 1,
    } as unknown as Job<WebhookJobData, { statusCode: number; durationMs: number }, string>;

    await expect(processor.process(mockJob)).rejects.toThrow(
      'Webhook respondió con código HTTP 500',
    );
  });

  it('debe propagar el error si ocurre fallo de red o timeout', async () => {
    fetchMock.mockRejectedValue(new Error('Connection timed out'));

    const mockJob = {
      id: 'job-timeout',
      data: {
        deliveryId: 'd-1',
        subscriptionId: 's-1',
        targetUrl: 'https://timeout.com',
        secret: 'sec',
        event: 'test',
        payload: { id: 'd-1', event: 'test', timestamp: '', data: {} },
      },
      attemptsMade: 0,
    } as unknown as Job<WebhookJobData, { statusCode: number; durationMs: number }, string>;

    await expect(processor.process(mockJob)).rejects.toThrow('Connection timed out');
  });
});

