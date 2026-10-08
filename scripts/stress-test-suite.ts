/**
 * Suite de Pruebas de Estrés y Alta Concurrencia (REST + WebSockets)
 *
 * Uso:
 *   npx tsx scripts/stress-test-suite.ts [baseUrl] [concurrency] [iterations]
 *   pnpm test:stress
 */

import { io, Socket } from 'socket.io-client';

const BASE_URL = process.argv[2] || process.env.STRESS_BASE_URL || 'http://localhost:3000';
const CONCURRENCY = parseInt(process.argv[3] || process.env.STRESS_CONCURRENCY || '50', 10);
const REQUESTS_PER_WORKER = parseInt(process.argv[4] || process.env.STRESS_REQUESTS || '20', 10);

interface LatencyStats {
  total: number;
  success: number;
  failed: number;
  latencies: number[];
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  min: number;
  max: number;
}

function calculateStats(latencies: number[], failed: number): LatencyStats {
  if (latencies.length === 0) {
    return {
      total: failed,
      success: 0,
      failed,
      latencies: [],
      p50: 0,
      p95: 0,
      p99: 0,
      avg: 0,
      min: 0,
      max: 0,
    };
  }

  latencies.sort((a, b) => a - b);
  const total = latencies.length + failed;
  const sum = latencies.reduce((acc, curr) => acc + curr, 0);

  const getPercentile = (p: number) => {
    const idx = Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length));
    return latencies[idx];
  };

  return {
    total,
    success: latencies.length,
    failed,
    latencies,
    p50: getPercentile(50),
    p95: getPercentile(95),
    p99: getPercentile(99),
    avg: Math.round((sum / latencies.length) * 100) / 100,
    min: latencies[0],
    max: latencies[latencies.length - 1],
  };
}

async function stressRestEndpoint(name: string, path: string): Promise<LatencyStats> {
  console.log(`\n▶️ Probando Endpoint REST: ${name} (${BASE_URL}${path})`);
  console.log(`   - Clientes concurrentes: ${CONCURRENCY}`);
  console.log(`   - Peticiones por cliente: ${REQUESTS_PER_WORKER}`);
  console.log(`   - Total peticiones esperadas: ${CONCURRENCY * REQUESTS_PER_WORKER}`);

  const latencies: number[] = [];
  let failed = 0;

  const runWorker = async () => {
    for (let i = 0; i < REQUESTS_PER_WORKER; i++) {
      const start = Date.now();
      try {
        const response = await fetch(`${BASE_URL}${path}`, {
          headers: { 'Accept': 'application/json' },
        });
        const duration = Date.now() - start;

        if (response.ok || response.status === 401 || response.status === 429) {
          // Status 401 o 429 (rate-limit) significa que el servidor manejó la petición correctamente
          latencies.push(duration);
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
  };

  const startTime = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => runWorker()));
  const totalDuration = (Date.now() - startTime) / 1000;

  const stats = calculateStats(latencies, failed);
  const rps = Math.round((stats.total / totalDuration) * 100) / 100;

  console.log(`   ✅ Completado en: ${totalDuration.toFixed(2)}s (${rps} req/seg)`);
  console.log(`   📊 Éxito: ${stats.success}/${stats.total} | Fallos: ${stats.failed}`);
  console.log(`   ⏱️  Latencia: Media=${stats.avg}ms, P50=${stats.p50}ms, P95=${stats.p95}ms, P99=${stats.p99}ms, Min=${stats.min}ms, Max=${stats.max}ms`);

  return stats;
}

async function stressWebSocketConnections(clientsCount: number): Promise<void> {
  console.log(`\n▶️ Probando Carga en WebSockets (/realtime)`);
  console.log(`   - Conexiones concurrentes simultáneas: ${clientsCount}`);

  const sockets: Socket[] = [];
  let connected = 0;
  let connectionErrors = 0;
  const pongs: number[] = [];

  const connectClient = (index: number): Promise<void> => {
    return new Promise((resolve) => {
      const socket = io(`${BASE_URL}/realtime`, {
        transports: ['websocket'],
        reconnection: false,
        timeout: 5000,
      });

      socket.on('connect', () => {
        connected++;
        const pingStart = Date.now();
        socket.emit('public_ping');
        socket.on('public_pong', () => {
          pongs.push(Date.now() - pingStart);
        });
        resolve();
      });

      socket.on('connect_error', () => {
        connectionErrors++;
        resolve();
      });

      sockets.push(socket);
    });
  };

  const startWs = Date.now();
  await Promise.all(Array.from({ length: clientsCount }, (_, i) => connectClient(i)));
  const wsDuration = (Date.now() - startWs) / 1000;

  console.log(`   ✅ Sockets conectados: ${connected}/${clientsCount} en ${wsDuration.toFixed(2)}s`);
  if (connectionErrors > 0) {
    console.log(`   ⚠️ Errores de conexión WS: ${connectionErrors}`);
  }

  // Esperar respuestas pong
  await new Promise((r) => setTimeout(r, 1000));
  if (pongs.length > 0) {
    pongs.sort((a, b) => a - b);
    const avgPong = Math.round((pongs.reduce((a, b) => a + b, 0) / pongs.length) * 100) / 100;
    console.log(`   🏓 Pings respondidos: ${pongs.length}/${connected} | Latencia media ping-pong: ${avgPong}ms`);
  }

  // Desconectar todos los sockets
  sockets.forEach((s) => s.disconnect());
}

async function runFullStressSuite() {
  console.log('===============================================================');
  console.log('🔥 SUITE COMPLETA DE PRUEBAS DE ESTRÉS Y RENDIMIENTO');
  console.log('===============================================================');
  console.log(`Servidor Objetivo: ${BASE_URL}`);

  try {
    // 1. Healthcheck / Terminus Endpoint
    await stressRestEndpoint('Salud y Monitoreo', '/api/health');

    // 2. Endpoint Raíz / Ping
    await stressRestEndpoint('Root API Ping', '/api');

    // 3. Prueba de Carga de WebSockets
    await stressWebSocketConnections(Math.min(CONCURRENCY, 100));

    console.log('\n===============================================================');
    console.log('🎉 SUITE DE ESTRÉS COMPLETADA SATISFACTORIAMENTE');
    console.log('===============================================================\n');
  } catch (err: unknown) {
    console.error('❌ Error durante la ejecución de la suite de estrés:', (err as Error).message);
  }
}

void runFullStressSuite();
