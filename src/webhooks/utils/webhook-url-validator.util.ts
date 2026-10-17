import { BadRequestException } from '@nestjs/common';

const BLOCKED_INTERNAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  'metadata.google.internal',
  '169.254.169.254',
  'postgres',
  'postgres-db',
  'postgres-replica',
  'redis',
  'seaweedfs',
  'clamav',
  'lavalink',
  'api',
  'workers',
  'nginx',
]);

const PRIVATE_IP_PATTERNS = [
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 127.0.0.0/8 Loopback
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 10.0.0.0/8 Private
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/, // 172.16.0.0/12 Private
  /^192\.168\.\d{1,3}\.\d{1,3}$/, // 192.168.0.0/16 Private
  /^169\.254\.\d{1,3}\.\d{1,3}$/, // 169.254.0.0/16 Link-local / Cloud Metadata
  /^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 0.0.0.0/8
];

/**
 * Valida que la URL de un webhook sea externa y segura contra ataques SSRF
 * (Server-Side Request Forgery), bloqueando loopback, redes privadas RFC 1918,
 * metadatos cloud (169.254.169.254) y nombres de contenedores internos.
 */
export function assertSafeWebhookUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException('La URL de destino del webhook no es válida');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException(
      'El protocolo del webhook debe ser exclusivamente http o https',
    );
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (
    BLOCKED_INTERNAL_HOSTS.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    PRIVATE_IP_PATTERNS.some((regex) => regex.test(hostname))
  ) {
    throw new BadRequestException(
      'URL de webhook rechazada por política anti-SSRF: no se permiten direcciones internas, loopback ni redes privadas',
    );
  }
}

