# 📈 Guía de Calibración, Dimensionamiento y Alta Concurrencia
## Calibración de Rate Limits (Throttler), Pools de Base de Datos y NGINX

Esta guía técnica explica cómo dimensionar y calibrar el sistema en función del volumen de usuarios concurrentes y el hardware disponible en el servidor.

---

## 📊 1. Matriz Maestra de Dimensionamiento (*Sizing Cheat Sheet*)

Utiliza esta tabla para saber exactamente **qué valores subir o bajar** según la cantidad de usuarios simultáneos y la capacidad de tu infraestructura:

| Métrica / Parámetro | 🟢 Nivel 1: Dev / VPS Pequeño | 🟡 Nivel 2: SaaS Creciente | 🟠 Nivel 3: Alta Escala | 🔴 Nivel 4: Masivo / Picos |
| :--- | :--- | :--- | :--- | :--- |
| **Usuarios Concurrentes Reales** | **1 a 100** | **100 a 1,000** | **1,000 a 5,000** | **5,000 a 20,000+** |
| **Peticiones/segundo (RPS)** | ~10 - 50 req/s | ~100 - 500 req/s | ~1,000 - 3,000 req/s | 5,000 - 15,000+ req/s |
| **Hardware Servidor Sugerido** | 1 - 2 vCPU \| 2 GB RAM | 2 - 4 vCPU \| 4 - 8 GB RAM | 4 - 8 vCPU \| 16 GB RAM | Clúster / Instancias dedicadas |
| `THROTTLE_LIMIT_SHORT` (1s) | `40` | `120` *(default)* | `300` | `800+` |
| `THROTTLE_LIMIT_MEDIUM` (10s) | `200` | `600` *(default)* | `1,500` | `4,000+` |
| `THROTTLE_LIMIT_LONG` (60s) | `800` | `2,500` *(default)* | `6,000` | `15,000+` |
| `DB_POOL_MAX` (PostgreSQL) | `15` | `50` *(default)* | `100` | `150 - 200` *(con PgBouncer)* |
| `DB_POOL_MIN` | `3` | `10` *(default)* | `20` | `40` |
| `DB_POOL_TIMEOUT_MS` | `5000` (5s) | `10000` (10s) | `15000` (15s) | `20000` (20s) |
| **Réplicas de Lectura (`DATABASE_REPLICA_URL`)** | No requerida | Opcional | **Recomendada** | **Obligatoria** |
| **NGINX `keepalive` (Upstream)** | `32` | `128` *(default)* | `256` | `512` |
| **NGINX `worker_connections`** | `2048` | `16384` *(default)* | `32768` | `65535` |
| **NGINX `keepalive_requests`** | `1000` | `10000` *(default)* | `20000` | `50000` |

---

## 🔍 2. Diagnóstico Rápido: "Si te pasa X, ajusta Y"

Guía para actuar ante síntomas de saturación o errores en producción:

### 🚨 Síntoma A: Los usuarios reciben error `429 Too Many Requests`
* **Causa:** La aplicación o el usuario está enviando más ráfagas de las permitidas por el Throttler.
* **Acción:**
  - Si ocurre durante navegación normal en la web o app móvil: **SUBE** `THROTTLE_LIMIT_SHORT` y `THROTTLE_LIMIT_MEDIUM` en tu archivo `.env`.
  - Si ocurre en una escuela/oficina donde muchos usuarios comparten el mismo Wi-Fi: Verifica que los clientes envíen cookies (`access_token`) o cabeceras Bearer para que el [`CustomThrottlerGuard`](./src/common/guards/custom-throttler.guard.ts) los aísle por usuario y no por IP.

---

### 🚨 Síntoma B: Error `Connection pool timeout` o lentitud en consultas
* **Causa:** Todas las conexiones de la base de datos están ocupadas y las peticiones entrantes deben esperar en cola.
* **Acción:**
  - **SUBE** `DB_POOL_MAX` a `75` o `100` en tu archivo `.env`.
  - **SUBE** `DB_POOL_TIMEOUT_MS` a `15000` (15 segundos).
  - **ACTIVA** la réplica de lectura (`DATABASE_REPLICA_URL`). Todas las consultas de lectura (`findMany`, `findUnique`, `count`) se irán al nodo secundario, liberando el pool primario para escrituras.

---

### 🚨 Síntoma C: Error de PostgreSQL `sorry, too many clients already`
* **Causa:** El total de conexiones de todos los servicios supera el `max_connections` configurado en el motor de PostgreSQL.
* **Acción:**
  - **BAJA** `DB_POOL_MAX` por contenedor, o **SUBE** `max_connections` en el arranque de PostgreSQL en [`docker-compose.yml`](./docker-compose.yml):
    ```yaml
    command:
      - postgres
      - -c
      - max_connections=200
    ```

---

### 🚨 Síntoma D: NGINX arroja `504 Gateway Timeout` o `502 Bad Gateway` bajo estrés
* **Causa:** NGINX agotó los sockets TCP efímeros hacia NestJS o el servidor Node.js tardó en responder.
* **Acción:**
  - **SUBE** `keepalive` en [`docker/nginx/conf.d/default.conf`](./docker/nginx/conf.d/default.conf) de `128` a `256` o `512`.
  - Verifica que `proxy_read_timeout` esté alineado en `90s`.

---

### 🚨 Síntoma E: El proceso de Node.js consume 100% de CPU
* **Causa:** Operaciones criptográficas pesadas (bcrypt), procesamiento de imágenes (Sharp) o escaneo antivirus (ClamAV) ejecutándose en el hilo principal.
* **Acción:**
  - Las tareas pesadas deben encolarse mediante **BullMQ** (ya configurado en el proyecto).
  - **BAJA** los límites de subida de archivos en [`files.controller.ts`](./src/files/files.controller.ts) a un máximo razonable por minuto.

---

## 🛠️ 3. Dónde modificar cada parámetro (Paso a Paso)

### Capa 1: Variables de Entorno (`.env`)
Los parámetros más críticos se controlan directamente en tu `.env` **sin tocar código**:

```ini
# ==============================================================================
# CALIBRACIÓN DE CONCURRENCIA Y CAPACIDAD
# ==============================================================================

# Throttler / Rate Limit
THROTTLE_LIMIT_SHORT=120       # Ráfagas en ventana de 1 segundo (por cliente)
THROTTLE_LIMIT_MEDIUM=600      # Ventana de 10 segundos
THROTTLE_LIMIT_LONG=2500       # Ventana de 60 segundos

# Pool de Base de Datos PostgreSQL
DB_POOL_MAX=50                 # Conexiones máximas simultáneas
DB_POOL_MIN=10                 # Conexiones mínimas calientes en espera
DB_POOL_TIMEOUT_MS=10000       # Tiempo máximo para esperar conexión libre (ms)
```

---

### Capa 2: Código de la Aplicación NestJS
Si deseas modificar los tiempos de ventana o la lógica de rastreo:

* **Ventanas globales:** Edita [`src/app.module.ts`](./src/app.module.ts):
  ```typescript
  ThrottlerModule.forRoot([
    { name: 'short', ttl: 1000, limit: Number(process.env.THROTTLE_LIMIT_SHORT) || 120 },
    { name: 'medium', ttl: 10000, limit: Number(process.env.THROTTLE_LIMIT_MEDIUM) || 600 },
    { name: 'long', ttl: 60000, limit: Number(process.env.THROTTLE_LIMIT_LONG) || 2500 },
  ])
  ```
* **Lógica de tracking por usuario:** Edita [`src/common/guards/custom-throttler.guard.ts`](./src/common/guards/custom-throttler.guard.ts) en el método `getTracker(req)`.

---

### Capa 3: NGINX Reverse Proxy
Para ajustar la capacidad perimetral:

1. **Conexiones del Servidor:** En [`docker/nginx/nginx.conf`](./docker/nginx/nginx.conf):
   ```nginx
   events {
       worker_connections 16384;  # Aumentar a 32768 si tienes más de 10k usuarios
       use epoll;
       multi_accept on;
   }
   ```
2. **Conexiones Persistentes Upstream:** En [`docker/nginx/conf.d/default.conf`](./docker/nginx/conf.d/default.conf):
   ```nginx
   upstream backend_api {
       server api:3000;
       keepalive 128;             # Subir a 256 en alta concurrencia
   }
   ```

---

## 🧪 4. Cómo Validar tu Calibración (Pruebas de Estrés)

Una vez aplicados los ajustes, valida el comportamiento con los scripts incluidos en el proyecto:

```bash
# 1. Benchmark HTTP nativo
pnpm run benchmark

# 2. Suite de pruebas de estrés de concurrencia y cerrojos
pnpm run test:stress

# 3. Prueba con herramienta externa (ejemplo con Autocannon o Apache Benchmark)
# 100 conexiones concurrentes durante 30 segundos:
npx autocannon -c 100 -d 30 http://localhost:3000/api/health
```

Revisa que la tasa de errores `429` o `5xx` se mantenga en **0%** bajo tu volumen esperado.
