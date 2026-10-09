import { Injectable, Logger } from '@nestjs/common';

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AlertPayload {
  title: string;
  message: string;
  severity?: AlertSeverity;
  source?: string;
  details?: Record<string, unknown>;
  timestamp?: string;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  async sendAlert(payload: AlertPayload): Promise<boolean> {
    const severity = payload.severity || 'warning';
    const source = payload.source || 'Sistema Core';
    const timestamp = payload.timestamp || new Date().toISOString();

    const formattedPayload = {
      ...payload,
      severity,
      source,
      timestamp,
    };

    // Log estructurado en consola
    const logMsg = `[${severity.toUpperCase()}] [${source}] ${payload.title}: ${payload.message}`;
    if (severity === 'critical' || severity === 'error') {
      this.logger.error(logMsg);
    } else if (severity === 'warning') {
      this.logger.warn(logMsg);
    } else {
      this.logger.log(logMsg);
    }

    const discordWebhookUrl = process.env.ALERT_DISCORD_WEBHOOK_URL;
    const slackWebhookUrl = process.env.ALERT_SLACK_WEBHOOK_URL;

    const promises: Promise<unknown>[] = [];

    if (discordWebhookUrl) {
      promises.push(this.dispatchDiscordAlert(discordWebhookUrl, formattedPayload));
    }

    if (slackWebhookUrl) {
      promises.push(this.dispatchSlackAlert(slackWebhookUrl, formattedPayload));
    }

    if (promises.length === 0) {
      return false;
    }

    try {
      await Promise.allSettled(promises);
      return true;
    } catch {
      return false;
    }
  }

  private async dispatchDiscordAlert(
    webhookUrl: string,
    alert: Required<Pick<AlertPayload, 'title' | 'message' | 'severity' | 'source' | 'timestamp'>> &
      Pick<AlertPayload, 'details'>,
  ): Promise<void> {
    try {
      const colorMap: Record<AlertSeverity, number> = {
        info: 0x3498db,      // Azul
        warning: 0xf39c12,   // Ámbar
        error: 0xe74c3c,     // Rojo
        critical: 0x8e44ad,  // Púrpura / Emergencia
      };

      const fields = [
        { name: '📍 Origen', value: alert.source, inline: true },
        { name: '⚠️ Severidad', value: alert.severity.toUpperCase(), inline: true },
        { name: '⏰ Fecha / Hora', value: alert.timestamp, inline: false },
      ];

      if (alert.details && Object.keys(alert.details).length > 0) {
        fields.push({
          name: '🔍 Detalles',
          value: `\`\`\`json\n${JSON.stringify(alert.details, null, 2).slice(0, 1000)}\n\`\`\``,
          inline: false,
        });
      }

      const body = {
        username: 'AntiGravity AlertBot',
        avatar_url: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
        embeds: [
          {
            title: `🚨 ${alert.title}`,
            description: alert.message,
            color: colorMap[alert.severity] || 0xf39c12,
            fields,
            footer: { text: 'Sistema Enterprise • Notificación de Monitoreo' },
            timestamp: alert.timestamp,
          },
        ],
      };

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err: unknown) {
      this.logger.warn(`No se pudo enviar alerta a Discord: ${(err as Error).message}`);
    }
  }

  private async dispatchSlackAlert(
    webhookUrl: string,
    alert: Required<Pick<AlertPayload, 'title' | 'message' | 'severity' | 'source' | 'timestamp'>> &
      Pick<AlertPayload, 'details'>,
  ): Promise<void> {
    try {
      const colorMap: Record<AlertSeverity, string> = {
        info: '#3498db',
        warning: '#f39c12',
        error: '#e74c3c',
        critical: '#8e44ad',
      };

      const body = {
        text: `*🚨 ${alert.title}* - ${alert.message}`,
        attachments: [
          {
            color: colorMap[alert.severity] || '#f39c12',
            fields: [
              { title: 'Origen', value: alert.source, short: true },
              { title: 'Severidad', value: alert.severity.toUpperCase(), short: true },
              { title: 'Mensaje', value: alert.message, short: false },
            ],
            ts: Math.floor(new Date(alert.timestamp).getTime() / 1000),
          },
        ],
      };

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err: unknown) {
      this.logger.warn(`No se pudo enviar alerta a Slack: ${(err as Error).message}`);
    }
  }
}

