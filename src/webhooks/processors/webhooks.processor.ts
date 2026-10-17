import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as crypto from 'crypto';
import { WEBHOOKS_QUEUE } from '../webhooks.constants';
import type { WebhookJobData } from '../webhooks.interfaces';
import { assertSafeWebhookUrl } from '../utils/webhook-url-validator.util';

@Processor(WEBHOOKS_QUEUE)
export class WebhooksProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhooksProcessor.name);

  async process(
    job: Job<
      WebhookJobData,
      { statusCode: number; durationMs: number },
      string
    >,
  ): Promise<{ statusCode: number; durationMs: number }> {
    const { targetUrl, secret, event, deliveryId, payload } = job.data;
    assertSafeWebhookUrl(targetUrl);
    const bodyJson = JSON.stringify(payload);

    // Firma HMAC-SHA256 estándar de la industria
    const signature = crypto
      .createHmac('sha256', secret)
      .update(bodyJson)
      .digest('hex');

    const startTime = Date.now();

    this.logger.debug(
      `[WebhooksProcessor] Despachando webhook: Evento='${event}', Destino='${targetUrl}', DeliveryId='${deliveryId}', Intento=${job.attemptsMade + 1}`,
    );

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature-256': signature,
          'X-Webhook-Event': event,
          'X-Webhook-Delivery-Id': deliveryId,
          'X-Webhook-Timestamp': payload.timestamp,
          'User-Agent': 'Sistema-Outbound-Webhook/1.0',
        },
        body: bodyJson,
        signal: AbortSignal.timeout(10000), // 10 segundos timeout
      });

      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(
          `Webhook respondió con código HTTP ${response.status}: ${errorText.slice(0, 300)}`,
        );
      }

      this.logger.log(
        `[WebhooksProcessor] Webhook entregado con éxito a ${targetUrl} (Status ${response.status}, ${durationMs}ms)`,
      );

      return {
        statusCode: response.status,
        durationMs,
      };
    } catch (error) {
      this.logger.error(
        `[WebhooksProcessor] Error al entregar webhook a ${targetUrl} (Intento ${job.attemptsMade + 1}): ${(error as Error).message}`,
      );
      // Lanzar el error para que BullMQ reintente con retroceso exponencial
      throw error;
    }
  }
}
