import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import * as crypto from 'crypto';
import { REDIS_CLIENT } from '../redis/redis.constants';
import {
  WEBHOOKS_QUEUE,
  WEBHOOK_SUBSCRIPTIONS_SET_KEY,
  WEBHOOK_SUBSCRIPTION_PREFIX,
} from './webhooks.constants';
import type {
  WebhookEventPayload,
  WebhookJobData,
  WebhookSubscription,
} from './webhooks.interfaces';
import type { CreateWebhookSubscriptionDto } from './dto/create-webhook-subscription.dto';
import { assertSafeWebhookUrl } from './utils/webhook-url-validator.util';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectQueue(WEBHOOKS_QUEUE) private readonly webhookQueue: Queue,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Registra una nueva suscripción a webhooks salientes.
   */
  async registerSubscription(
    dto: CreateWebhookSubscriptionDto,
  ): Promise<WebhookSubscription> {
    assertSafeWebhookUrl(dto.url);

    const id = crypto.randomUUID();
    const secret = dto.secret || crypto.randomBytes(32).toString('hex');

    const subscription: WebhookSubscription = {
      id,
      url: dto.url,
      secret,
      events: dto.events,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      description: dto.description,
      createdAt: new Date().toISOString(),
    };

    const key = `${WEBHOOK_SUBSCRIPTION_PREFIX}${id}`;
    await this.redis.set(key, JSON.stringify(subscription));
    await this.redis.sadd(WEBHOOK_SUBSCRIPTIONS_SET_KEY, id);

    this.logger.log(
      `Suscripción de webhook registrada: ID=${id}, URL=${subscription.url}, Eventos=[${subscription.events.join(', ')}]`,
    );

    return subscription;
  }

  /**
   * Obtiene todas las suscripciones de webhooks activas/inactivas.
   */
  async listSubscriptions(): Promise<WebhookSubscription[]> {
    const ids = await this.redis.smembers(WEBHOOK_SUBSCRIPTIONS_SET_KEY);
    if (!ids || ids.length === 0) {
      return [];
    }

    const pipeline = this.redis.pipeline();
    for (const id of ids) {
      pipeline.get(`${WEBHOOK_SUBSCRIPTION_PREFIX}${id}`);
    }

    const results = await pipeline.exec();
    const subscriptions: WebhookSubscription[] = [];

    if (results) {
      for (const [err, raw] of results) {
        if (!err && raw && typeof raw === 'string') {
          try {
            subscriptions.push(JSON.parse(raw) as WebhookSubscription);
          } catch {
            // Ignorar formato inválido
          }
        }
      }
    }

    return subscriptions;
  }

  /**
   * Obtiene una suscripción específica por su ID.
   */
  async getSubscription(id: string): Promise<WebhookSubscription | null> {
    const raw = await this.redis.get(`${WEBHOOK_SUBSCRIPTION_PREFIX}${id}`);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as WebhookSubscription;
    } catch {
      return null;
    }
  }

  /**
   * Elimina una suscripción de webhook por su ID.
   */
  async deleteSubscription(id: string): Promise<boolean> {
    const key = `${WEBHOOK_SUBSCRIPTION_PREFIX}${id}`;
    const deleted = await this.redis.del(key);
    await this.redis.srem(WEBHOOK_SUBSCRIPTIONS_SET_KEY, id);
    return deleted > 0;
  }

  /**
   * Calcula la firma HMAC-SHA256 para el cuerpo de la petición.
   */
  computeSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Despacha un evento genérico a todos los suscriptores correspondientes encolándolo en BullMQ.
   */
  async dispatch(
    event: string,
    data: unknown,
  ): Promise<{ queuedCount: number; jobIds: string[] }> {
    const subscriptions = await this.listSubscriptions();
    const matchingSubs = subscriptions.filter(
      (sub) =>
        sub.isActive &&
        (sub.events.includes('*') || sub.events.includes(event)),
    );

    if (matchingSubs.length === 0) {
      return { queuedCount: 0, jobIds: [] };
    }

    const jobIds: string[] = [];

    for (const sub of matchingSubs) {
      const deliveryId = crypto.randomUUID();
      const payload: WebhookEventPayload = {
        id: deliveryId,
        event,
        timestamp: new Date().toISOString(),
        data,
      };

      const jobData: WebhookJobData = {
        deliveryId,
        subscriptionId: sub.id,
        targetUrl: sub.url,
        secret: sub.secret,
        event,
        payload,
      };

      const job = await this.webhookQueue.add(
        `webhook-dispatch-${event}`,
        jobData,
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

      if (job.id) {
        jobIds.push(job.id);
      }
    }

    this.logger.log(
      `Evento de webhook '${event}' encolado para ${matchingSubs.length} suscriptor(es). Jobs: [${jobIds.join(', ')}]`,
    );

    return {
      queuedCount: matchingSubs.length,
      jobIds,
    };
  }
}
