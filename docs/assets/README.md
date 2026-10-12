# 📁 Directorio de Recursos Visuales y Evidencias Técnicas (`docs/assets/`)

Este directorio contiene las capturas de pantalla de arquitectura, infraestructura, pruebas y métricas para el [**README.md**](../../README.md) principal.

---

### 📸 Catálogo de Capturas Técnicas en Parejas Temáticas

Cada tema está compuesto por dos capturas complementarias (**.1** vista general/resumen y **.2** detalle interactivo o prueba comparativa):

```text
docs/assets/
├── hero-banner.png                 # Banner panorámico 16:9 principal
├── banner.svg                      # Versión vectorial SVG de alta resolución
│
├── 01-scalar-overview.png          # 1.1: Vista general Scalar con los 23 controladores
├── 01-scalar-endpoint-detail.png   # 1.2: Detalle interactivo de un endpoint con esquemas JSON
│
├── 02-jest-tests-summary.png       # 2.1: Resumen de Jest con 119 suites (100% Passed)
├── 02-jest-coverage-report.png     # 2.2: Reporte detallado de cobertura (pnpm run test:cov)
│
├── 03-docker-services-status.png   # 3.1: Salida de docker compose ps con los 13 contenedores en verde
├── 03-docker-logs-or-stats.png     # 3.2: Métricas de recursos con docker stats o logs de réplicas
│
├── 04-prisma-schema-models.png     # 4.1: Catálogo de tablas relacionales en Prisma Studio
├── 04-prisma-entity-relations.png  # 4.2: Detalle de registros (roles y prioridades o logs con diff)
│
├── 05-stress-without-ratelimit.png # 5.1: Benchmark SIN Rate Limit (rendimiento y throughput bruto)
├── 05-stress-with-ratelimit.png    # 5.2: Benchmark CON Rate Limit (protección activa 429 Too Many Requests)
│
├── 06-health-check-json.png        # 6.1: Respuesta JSON formateada de /api/health
└── 06-prometheus-metrics.png       # 6.2: Métricas expuestas en formato Prometheus (/api/health/metrics)
```

---

### 📋 Detalle de cada Captura:

| Código | Nombre de Archivo | Qué capturar | Comando / URL |
| :---: | :--- | :--- | :--- |
| **1.1** | `01-scalar-overview.png` | Sidebar de Scalar en Dark Mode con los 23 controladores | `http://localhost:3000/api/docs` |
| **1.2** | `01-scalar-endpoint-detail.png` | Endpoint expandido mostrando schemas y botón de prueba | `POST /api/auth/login` o `GET /api/roles` |
| **2.1** | `02-jest-tests-summary.png` | Terminal con el bloque verde `119 passed, 627 total` | `pnpm test` |
| **2.2** | `02-jest-coverage-report.png` | Tabla de porcentaje de cobertura de código por archivo | `pnpm run test:cov` |
| **3.1** | `03-docker-services-status.png` | Tabla de contenedores con estatus `healthy` / `Up` | `docker compose ps` |
| **3.2** | `03-docker-logs-or-stats.png` | Consumo de CPU/RAM de contenedores o logs de Nginx | `docker stats --no-stream` |
| **4.1** | `04-prisma-schema-models.png` | Lista de modelos en Prisma Studio | `pnpm prisma studio` (`:5555`) |
| **4.2** | `04-prisma-entity-relations.png` | Tabla `Role` con prioridades o `AuditLog` con diff JSON | Navegar en Prisma Studio |
| **5.1** | `05-stress-without-ratelimit.png` | **Prueba de Estrés SIN Rate Limit:** Throughput bruto | `pnpm run benchmark` (con rate limit apagado) |
| **5.2** | `05-stress-with-ratelimit.png` | **Prueba de Estrés CON Rate Limit:** Bloqueo de ráfagas | `pnpm run benchmark` (observando respuestas 429) |
| **6.1** | `06-health-check-json.png` | Diagnóstico de salud de Postgres, Redis y S3 en JSON | `http://localhost:3000/api/health` |
| **6.2** | `06-prometheus-metrics.png` | Métricas estándar de OpenMetrics para Grafana | `http://localhost:3000/api/health/metrics` |

---

> [!TIP]
> **Formato sugerido:** Guarda las imágenes en formato `.png`. Si las procesas con [shots.so](https://shots.so) en modo oscuro para agregar un marco con sombra, lucirán con una estética impecable en tu portafolio.
