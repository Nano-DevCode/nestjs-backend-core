import { Test, TestingModule } from '@nestjs/testing';
import { AlertsService } from './alerts.service';

describe('AlertsService', () => {
  let service: AlertsService;
  const originalEnv = process.env;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.ALERT_DISCORD_WEBHOOK_URL;
    delete process.env.ALERT_SLACK_WEBHOOK_URL;

    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({}),
      text: jest.fn().mockResolvedValue('ok'),
    });
    global.fetch = fetchMock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [AlertsService],
    }).compile();

    service = module.get<AlertsService>(AlertsService);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe registrar en log y retornar false si no hay URLs de webhook configuradas', async () => {
    const result = await service.sendAlert({
      title: 'Prueba Local',
      message: 'Mensaje de prueba sin webhook',
      severity: 'info',
    });

    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('debe despachar alerta a Discord con formato embed cuando ALERT_DISCORD_WEBHOOK_URL está configurada', async () => {
    process.env.ALERT_DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/123/xyz';

    const result = await service.sendAlert({
      title: 'Fallo de Memoria',
      message: 'Consumo RSS excedido',
      severity: 'error',
      source: 'Worker 1',
      details: { rssMB: 1800, threshold: 1500 },
    });

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://discord.com/api/webhooks/123/xyz');
    expect(options.method).toBe('POST');
    const parsedBody = JSON.parse(options.body);
    expect(parsedBody.embeds[0].title).toContain('Fallo de Memoria');
    expect(parsedBody.embeds[0].color).toBe(0xe74c3c); // Color de error
    expect(parsedBody.embeds[0].fields.some((f: any) => f.name === '📍 Origen')).toBe(true);
    expect(parsedBody.embeds[0].fields.some((f: any) => f.name === '🔍 Detalles')).toBe(true);
  });

  it('debe despachar alerta a Slack con attachments cuando ALERT_SLACK_WEBHOOK_URL está configurada', async () => {
    process.env.ALERT_SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/X00';

    const result = await service.sendAlert({
      title: 'Latencia Elevada',
      message: 'Base de datos respondiendo lento',
      severity: 'warning',
    });

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.slack.com/services/T00/B00/X00');
    expect(options.method).toBe('POST');
    const parsedBody = JSON.parse(options.body);
    expect(parsedBody.text).toContain('Latencia Elevada');
    expect(parsedBody.attachments[0].color).toBe('#f39c12'); // Color de warning
  });

  it('debe despachar a ambos canales cuando ambos webhooks están configurados', async () => {
    process.env.ALERT_DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/123/xyz';
    process.env.ALERT_SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/X00';

    const result = await service.sendAlert({
      title: 'Alerta Crítica',
      message: 'Servicio no disponible',
      severity: 'critical',
    });

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('no debe arrojar excepción si fetch falla (resiliencia)', async () => {
    process.env.ALERT_DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/123/xyz';
    fetchMock.mockRejectedValue(new Error('Network timeout'));

    const result = await service.sendAlert({
      title: 'Fallo de Red',
      message: 'Prueba de tolerancia a fallos',
      severity: 'critical',
    });

    expect(result).toBe(true); // Promise.allSettled maneja la promesa resuelta
  });
});

