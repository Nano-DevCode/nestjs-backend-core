/**
 * Script de Pruebas de Carga y Concurrencia con Autocannon
 *
 * Uso:
 *   node scripts/benchmark.js [url] [conexiones] [duracion_segundos]
 *   pnpm benchmark
 *
 * Por defecto:
 *   URL: http://localhost:3000/api/health
 *   Conexiones simultáneas: 50
 *   Duración: 10 segundos
 */

const autocannon = require('autocannon');

const url = process.argv[2] || process.env.BENCHMARK_URL || 'http://localhost:3000/api/health';
const connections = parseInt(process.argv[3] || process.env.BENCHMARK_CONNECTIONS || '50', 10);
const duration = parseInt(process.argv[4] || process.env.BENCHMARK_DURATION || '10', 10);

console.log('===============================================================');
console.log('🚀 INICIANDO PRUEBA DE CARGA Y ALTA CONCURRENCIA');
console.log('===============================================================');
console.log(`📍 Objetivo:               ${url}`);
console.log(`👥 Conexiones concurrentes: ${connections}`);
console.log(`⏱️  Duración de la prueba:   ${duration} segundos`);
console.log('===============================================================\n');

const instance = autocannon(
  {
    url,
    connections,
    duration,
    pipelining: 1,
    headers: {
      'content-type': 'application/json',
    },
  },
  (err, result) => {
    if (err) {
      console.error('❌ Error al ejecutar el benchmark:', err);
      process.exit(1);
    }

    console.log('\n===============================================================');
    console.log('📊 RESULTADOS DEL BENCHMARK');
    console.log('===============================================================');
    console.log(`Peticiones totales:     ${result.requests.total}`);
    console.log(`RPS promedio:           ${result.requests.average} req/s`);
    console.log(`RPS máximo:             ${result.requests.max} req/s`);
    console.log(`Transferencia total:    ${(result.throughput.total / (1024 * 1024)).toFixed(2)} MB`);
    console.log('---------------------------------------------------------------');
    console.log('Latencias:');
    console.log(`  - Promedio:           ${result.latency.average} ms`);
    console.log(`  - Mediana (p50):      ${result.latency.p50} ms`);
    console.log(`  - Percentil 90 (p90): ${result.latency.p90} ms`);
    console.log(`  - Percentil 95 (p95): ${result.latency.p97_5 || result.latency.p90} ms`);
    console.log(`  - Percentil 99 (p99): ${result.latency.p99} ms`);
    console.log(`  - Máximo:             ${result.latency.max} ms`);
    console.log('---------------------------------------------------------------');
    console.log('Códigos de respuesta:');
    console.log(`  - 1xx:                ${result['1xx']}`);
    console.log(`  - 2xx:                ${result['2xx']}`);
    console.log(`  - 3xx:                ${result['3xx']}`);
    console.log(`  - 4xx:                ${result['4xx']}`);
    console.log(`  - 5xx:                ${result['5xx']}`);
    console.log(`Errores de socket:      ${result.errors}`);
    console.log(`Timeouts:               ${result.timeouts}`);
    console.log('===============================================================');

    if (result['5xx'] > 0 || result.errors > 0 || result.timeouts > 0) {
      console.warn('⚠️ Se detectaron fallos o timeouts bajo carga sostenida.');
    } else {
      console.log('✅ Prueba completada con 0 errores y estabilidad óptima.');
    }
  },
);

autocannon.track(instance, { renderProgressBar: true });
