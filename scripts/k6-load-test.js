import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 20 },  // Ramp-up a 20 usuarios
    { duration: '30s', target: 50 },  // Mantener 50 usuarios
    { duration: '10s', target: 100 }, // Pico de estrés a 100 usuarios
    { duration: '10s', target: 0 },   // Ramp-down a 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% de las peticiones deben responder en <500ms
    http_req_failed: ['rate<0.01'],    // Menos del 1% de errores permitidos
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // 1. Healthcheck
  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, {
    'health status es 200': (r) => r.status === 200,
  });

  // 2. Endpoint público
  const apiRes = http.get(`${BASE_URL}/api`);
  check(apiRes, {
    'api status es 200': (r) => r.status === 200,
  });

  sleep(0.5);
}

