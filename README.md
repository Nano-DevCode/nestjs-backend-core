<p align="center">
  <img src="docs/assets/hero-banner.png" width="100%" alt="NestJS Enterprise Core Platform" />
</p>

<h1 align="center">Enterprise Backend Core Architecture</h1>

<p align="center">
  <b>Plataforma Empresarial Escalable, Resiliente y Modular de Alto Rendimiento</b><br>
  Construida con <b>NestJS 12</b>, <b>TypeScript</b>, <b>Prisma ORM 7</b> con <b>Réplicas de Lectura PostgreSQL</b>, <b>Redis 7</b>, <b>BullMQ</b>, <b>SeaweedFS S3 + ClamAV</b> y <b>Docker Compose</b>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-v12.0-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-22.x-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Prisma_ORM-v7.10-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/PostgreSQL-16_Replication-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Redis-v7.x-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/BullMQ-Worker_Queues-FF5722?style=for-the-badge&logo=redis&logoColor=white" alt="BullMQ" />
  <img src="https://img.shields.io/badge/Docker_Compose-13_Services-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/Jest_Tests-119_Suites_Passed-C21325?style=for-the-badge&logo=jest&logoColor=white" alt="Jest" />
  <img src="https://img.shields.io/badge/API_Docs-Scalar_OpenAPI_3.1-000000?style=for-the-badge&logo=openapiinitiative&logoColor=white" alt="Scalar Docs" />
</p>

---

## 📌 Resumen Ejecutivo & Filosofía de Ingeniería

Este repositorio constituye el núcleo de backend para una suite de software empresarial multi-cliente (**Web SPA en React + Vite** y **App Móvil en React Native + Expo**). Ha sido diseñado bajo estándares estrictos de **Arquitectura Hexagonal / Domain-Driven Design (DDD)** modular, enfocándose en:

1. **Defensa en Profundidad (Defense in Depth)**: Autenticación de doble canal (Cookies `HttpOnly` para Web y rotación criptográfica de tokens para Mobile), 2FA/MFA mediante TOTP con llaves cifradas con **AES-256-GCM**, control de acceso basado en roles (RBAC) con jerarquía matemática de prioridades y rate-limiting adaptativo.
2. **Escalabilidad y Alta Disponibilidad de Datos**: Integración de **Prisma ORM 7** con extensión nativa de **Read Replicas**, permitiendo balanceo físico de lecturas hacia réplicas PostgreSQL 16 y conmutación por error (*graceful fallback*) hacia el nodo primario.
3. **Resiliencia & Concurrencia Distribuida**: Protección contra mutaciones duplicadas mediante un **Interceptor de Idempotencia** respaldado en Redis, control de condiciones de carrera con **Cerrojos Distribuidos (Redlock)** y colas de trabajo asíncronas con reintentos exponenciales en **BullMQ**.
4. **Almacenamiento Seguro & Desinfección en Vuelo**: Pipeline de subida de archivos compatible con **AWS S3 / SeaweedFS** mediante URLs prefirmadas (*Presigned URLs*), escaneo en streaming mediante el daemon antivirus **ClamAV** y procesamiento optimizado a formato WebP con **Sharp**.
5. **Observabilidad, Auditoría Forense y DevOps**: Auditoría de cambios con cálculo de diferencias JSON (*diff*), captura estructurada de excepciones bajo el estándar **RFC 7807**, orquestación integral con Docker Compose (13 servicios incluyendo Nginx, Fail2Ban, Certbot, respaldos automatizados y Cloudflare Tunnel).

---

## 🏛️ Diagrama de Arquitectura del Sistema

```mermaid
flowchart TD
    subgraph Clients["🌐 Clientes & Consumidores"]
        Web["🖥️ Web App (React / Vite)"]
        Mobile["📱 Mobile App (React Native / Expo)"]
        Discord["🤖 Discord Gateway Events"]
    end

    subgraph Perimeter["🛡️ Perímetro & Reverse Proxy"]
        CF["Cloudflare Tunnel / DNS"]
        F2B["Fail2Ban (DOCKER-USER IPTables)"]
        Nginx["NGINX Reverse Proxy (SSL / TLS / Certbot)"]
        CF --> Nginx
        F2B -.->|Protege| Nginx
    end

    subgraph API_Core["⚡ NestJS 12 Enterprise Engine"]
        Throttler["CustomThrottlerGuard (Leaky Bucket / Rate Limit)"]
        Helmet["OWASP Helmet & CORS"]
        Idemp["IdempotencyInterceptor (Redis Keys)"]
        RFC7807["RFC 7807 Exception Filter"]
        
        subgraph Auth_Security["🔐 Capa de Seguridad & Control"]
            DualAuth["Dual-Token Auth (Cookies Web / Bearer Mobile)"]
            TwoFactor["TOTP 2FA (AES-256-GCM + Backup Codes)"]
            RBAC["Hierarchical RBAC (Priority & Matrix Guard)"]
        end

        subgraph Core_Domains["📦 Módulos de Dominio (Vertical Slices)"]
            Users["Users & Profiles"]
            Roles["Roles & Permisos"]
            Audit["Audit & Forensic Diffs"]
            FilesModule["Files & S3 Manager"]
            Tasks["Tasks & BullMQ Workers"]
            Notifications["Notifications (In-App / Expo Push)"]
            DiscordBot["Discord Bot & Lavalink Service"]
            Webhooks["Webhooks & Telemetry"]
        end
    end

    subgraph Persistence["🗄️ Capa de Datos, Caché & Streaming"]
        PG_Primary[("🐘 PostgreSQL 16 (Primary - Writes)")]
        PG_Replica[("🐘 PostgreSQL 16 (Replica - Reads)")]
        Redis_Store[("⚡ Redis 7 (Cache, Sessions, Locks, Blacklist)")]
        BullMQ_Queues[("📨 BullMQ Job Queues")]
        Seaweed_S3[("🪣 SeaweedFS (S3-Compatible Object Store)")]
        ClamAV_Daemon["🛡️ ClamAV Antivirus Daemon (TCP:3310)"]
        Lavalink_Node["🎵 Lavalink v4 Audio Node"]
    end

    Clients --> Perimeter
    Perimeter --> Throttler
    Throttler --> Helmet --> Idemp --> RFC7807
    RFC7807 --> DualAuth --> TwoFactor --> RBAC
    RBAC --> Core_Domains

    Users & Roles & Audit -->|Escritura Directa| PG_Primary
    Users & Roles & Audit -->|Lectura Optimizada| PG_Replica
    PG_Primary -.->|Streaming Replication WAL| PG_Replica
    
    DualAuth & Idemp & TwoFactor --> Redis_Store
    Tasks & Notifications --> BullMQ_Queues
    BullMQ_Queues --> Redis_Store
    
    FilesModule -->|Presigned URLs / Direct Upload| Seaweed_S3
    FilesModule -->|Streaming Scan TCP| ClamAV_Daemon
```

---

## 📸 Evidencias Técnicas y Métricas de Infraestructura

> [!NOTE]
> Evidencias reales de ejecución capturadas en entorno local y de pruebas, almacenadas en [`docs/screenshots/`](./docs/screenshots/).

### 1. Documentación Interactiva de la API (Scalar / OpenAPI)
| 1.1 Vista General de la API y Catálogo de 23 Módulos | 1.2 Detalle de Endpoint, Esquemas y Consola de Pruebas |
| :---: | :---: |
| <img src="./docs/screenshots/1.1.png" width="100%" alt="Scalar API Overview" /> | <img src="./docs/screenshots/1.2.png" width="100%" alt="Scalar Endpoint Detail" /> |
| *Navegación completa por dominios en Dark Mode (`/api/docs`)* | *Contratos OpenAPI 3.1 y consola interactiva de peticiones* |

### 2. Calidad de Software y Suite de Pruebas (Jest)
| 2.1 Ejecución de Suites de Prueba | 2.2 Resumen Final: 119 Suites y 627 Tests (100% Passed) |
| :---: | :---: |
| <img src="./docs/screenshots/2.1.png" width="100%" alt="Jest Test Execution" /> | <img src="./docs/screenshots/2.8.png" width="100%" alt="Jest Tests 100% Passed" /> |
| *Validación de guards, interceptores, cifrado y flujos transaccionales* | *119 test suites y 627 casos de prueba aprobados al 100%* |

<details>
<summary><b>🔍 Ver trazabilidad completa de ejecución de pruebas (Capturas 2.2 a 2.7)</b></summary>

| Ejecución Módulos Core | Ejecución Módulos de Seguridad |
| :---: | :---: |
| <img src="./docs/screenshots/2.2.png" width="100%" alt="Jest Suite 2.2" /> | <img src="./docs/screenshots/2.3.png" width="100%" alt="Jest Suite 2.3" /> |
| <img src="./docs/screenshots/2.4.png" width="100%" alt="Jest Suite 2.4" /> | <img src="./docs/screenshots/2.5.png" width="100%" alt="Jest Suite 2.5" /> |
| <img src="./docs/screenshots/2.6.png" width="100%" alt="Jest Suite 2.6" /> | <img src="./docs/screenshots/2.7.png" width="100%" alt="Jest Suite 2.7" /> |

</details>

### 3. Infraestructura y Orquestación (Docker Compose)
| 3.1 Estado de los 13 Contenedores (`healthy` / `Up`) |
| :---: |
| <img src="./docs/screenshots/3.1.png" width="100%" alt="Docker Compose Services" /> |
| *Orquestación de Postgres 16, Redis 7, ClamAV, SeaweedFS S3, Nginx y Certbot en Docker Compose* |

### 4. Modelado Relacional de Datos (Prisma Studio)
| 4.1 Catálogo de Tablas y Entidades Relacionales |
| :---: |
| <img src="./docs/screenshots/4.1.png" width="100%" alt="Prisma Studio Models" /> |
| *Exploración visual del esquema relacional tipado con Prisma ORM 7 (`http://localhost:5555`)* |

### 5. Resiliencia, Pruebas de Carga y Rate Limiting (Benchmarks)

#### 5.1 Rendimiento Bruto (SIN Rate Limit - Throughput Máximo)
| 5.1.1 Benchmark Concurrente sin Limitaciones | 5.1.2 Métricas de Latencia y Peticiones por Segundo |
| :---: | :---: |
| <img src="./docs/screenshots/5.1.1.png" width="100%" alt="Benchmark Without Rate Limit 1" /> | <img src="./docs/screenshots/5.1.2.png" width="100%" alt="Benchmark Without Rate Limit 2" /> |
| *Capacidad de absorción de ráfagas masivas sin códigos 429* | *Distribución de latencias (p50, p95, p99) a máxima velocidad* |

#### 5.2 Protección Activa Perimetral (CON Rate Limit - Defensa Anti-DDoS)
| 5.2.1 Mitigación de Saturación Activa | 5.2.2 Respuestas HTTP 429 Too Many Requests |
| :---: | :---: |
| <img src="./docs/screenshots/5.2.1.png" width="100%" alt="Benchmark With Rate Limit 1" /> | <img src="./docs/screenshots/5.2.2.png" width="100%" alt="Benchmark With Rate Limit 2" /> |
| *El Throttler protege activamente la CPU y la base de datos* | *Bloqueo controlado de ráfagas abusivas protegiendo la disponibilidad* |

### 6. Diagnóstico de Salud y Telemetría
| 6.1 Estado de Salud del Sistema en Tiempo Real (`/api/health`) |
| :---: |
| <img src="./docs/screenshots/6.1.png" width="100%" alt="Health Check JSON" /> |
| *Diagnóstico JSON de conectividad con PostgreSQL Primario, Réplica, Redis, S3 y métricas de memoria* |

---

## 🚀 Capacidades y Módulos Destacados

### 1. 🛡️ Autenticación y Seguridad Multicanal (Dual-Token + 2FA)
- **Estrategia Dual Web/Mobile**:
  - **Web SPA**: Tokens emitidos en cookies seguras `HttpOnly`, `SameSite=Lax`, con mitigación total contra vulnerabilidades XSS y CSRF.
  - **Mobile Expo**: Tokens de acceso Bearer acompañados de un sistema estricto de **Rotación de Refresh Tokens (RTR)** almacenados de forma dispersa con huella de dispositivo (*device fingerprinting*). La detección de reutilización anula inmediatamente todas las sesiones asociadas por seguridad.
- **Autenticación en Dos Pasos (TOTP MFA RFC 6238)**:
  - Generación de secretos TOTP vinculables a Google Authenticator / Authy mediante códigos QR.
  - Secretos maestros cifrados en reposo mediante **AES-256-GCM** con vector de inicialización (IV) único por usuario.
  - Generación de 10 códigos de emergencia (*recovery codes*) hasheados con `bcrypt`, garantizando un único uso.
  - Scripts CLI dedicados para mantenimiento operativo: `pnpm rotate:2fa` (rotación de clave maestra) y `pnpm reset:2fa`.
- **Inicio de Sesión Social (OAuth2)**:
  - Integración nativa con **Google** y **Facebook/GitHub**, reconciliando identidades por email verificado y asociando perfiles automáticamente.

### 2. 👥 Control de Acceso Basado en Roles (RBAC) Matemático y Jerárquico
- **Matriz de Permisos Desacoplada**: Control de autorizaciones granular mediante identificadores `recurso:accion` (`users:create`, `roles:delete`, `files:upload`, etc.).
- **Jerarquía Numérica por Prioridad**:
  - Cada rol cuenta con una prioridad entera (ej. `Superadmin = 100`, `Administrador = 80`, `Moderador = 50`, `Usuario = 10`).
  - **Invariante de Seguridad**: Ningún usuario puede asignar un rol con prioridad igual o superior a la suya, ni modificar o eliminar a un usuario de jerarquía superior o equivalente.
- **Paginación Dinámica de Roles**: Endpoint paginado (`GET /api/roles`) con soporte de filtrado en vivo, ordenamiento dinámico por campos, límite configurable y opción de exportación masiva.

### 3. 🗄️ Arquitectura de Base de Datos: Prisma ORM 7 + Réplicas de Lectura
- **PostgreSQL 16 con Replicación WAL**:
  - Contenedor maestro con configuración `wal_level=replica`, `max_wal_senders=10` y script de inicialización de credenciales de replicación automática.
  - Contenedor standby de réplica física levantable mediante el perfil `--profile with-replica`.
- **Enrutamiento Inteligente con Prisma 7**:
  - Implementación de `@prisma/adapter-pg` y `@prisma/extension-read-replicas`.
  - Todas las operaciones de mutación (`create`, `update`, `delete`, `$transaction`) se dirigen al nodo primario.
  - Las consultas de solo lectura (`findMany`, `findUnique`, `count`) se delegan automáticamente a la réplica, descargando la carga transaccional del primario.
  - **Resiliencia ante Caídas**: Si la réplica experimenta latencia o desconexión, el driver conmuta de forma transparente las lecturas al nodo primario sin lanzar excepciones al cliente.
- **Seeding Idempotente**: Script `pnpm seed` (`prisma/seeds/main.seed.ts`) que garantiza el aprovisionamiento reproducible de roles, permisos, usuario raíz y configuraciones maestras sin duplicar registros.

### 4. ⚡ Caching, Redlock e Idempotencia HTTP
- **Interceptor de Idempotencia (`X-Idempotency-Key`)**:
  - Bloquea peticiones duplicadas de métodos mutables (`POST`, `PUT`, `PATCH`) usando Redis como almacén atómico transitorio.
  - Si un cliente móvil reintenta una creación de ticket o cobro por parpadeo de red, el interceptor devuelve exactamente la respuesta original procesada sin duplicar el registro en la base de datos.
- **Cerrojos Distribuidos (Redlock)**:
  - Servicios de concurrencia basados en scripts Lua en Redis para ejecutar transacciones críticas con exclusión mutua distribuida (*mutual exclusion*).
- **Rate-Limiting Multinivel con Throttler**:
  - Ventana corta: 20 req / 1 segundo (absorción de ráfagas).
  - Ventana media: 80 req / 10 segundos (tráfico de navegación regular).
  - Ventana larga: 300 req / 1 minuto (protección perimetral anti-scraping / DDoS).

### 5. 📨 Procesamiento Asíncrono en Segundo Plano (BullMQ)
- Colas de trabajo desacopladas orquestadas con Redis para tareas no bloqueantes:
  - **Notificaciones**: Despacho de notificaciones Push hacia Expo y eventos WebSocket en tiempo real.
  - **Emails Transaccionales**: Envío en diferido con plantillas HTML dinámicas (verificación de cuenta, restablecimiento de contraseña, alertas de seguridad).
  - **Buffer Flusher de Auditoría**: Los logs forenses de auditoría se encolan en memoria/Redis y se persisten en base de datos mediante volcados por lotes (*batch flushes*), eliminando el overhead de escritura síncrona en el ciclo HTTP.

### 6. 🪣 Almacenamiento Compatible con S3 & Escaneo Antivirus en Vuelo
- **SeaweedFS / AWS S3**: Almacenamiento distribuido de objetos con generación de *Presigned URLs* para descarga y subida directa segura.
- **Daemon Antivirus ClamAV**:
  - Cada archivo entrante se transmite en streaming directo al socket TCP de ClamAV (`3310`).
  - Cualquier firma maliciosa detectada interrumpe el flujo, rechaza la petición con código 400 y registra un evento de auditoría de seguridad.
- **Pipeline de Imágenes con Sharp**: Conversión transparente a formato WebP, compresión agresiva sin degradación visual y generación automática de miniaturas para optimizar el consumo de ancho de banda móvil.

### 7. 🤖 Bot de Discord & Audio Lavalink v4 (Zero-Overhead Feature Flagging)
- Integración de **Discord.js v14 Gateway** y cliente de audio **Shoukaku v4 / Lavalink v4**.
- **Arquitectura de Impacto Cero**:
  - Activación gobernada por la variable `DISCORD_BOT_ENABLED`.
  - Cuando se encuentra deshabilitada, ningún socket de red ni proceso en segundo plano de Discord se inicia en el servidor, respondiendo `503 Service Unavailable` en las rutas de la API sin consumir CPU ni memoria.

### 8. 📑 Documentación OpenAPI 3.1 Interactiva con Scalar
- Referencia interactiva de la API servida en `/api/docs` mediante `@scalar/nestjs-api-reference`.
- **Protección Perimetral**: Protegida mediante HTTP Basic Auth (`DOCS_USER` / `DOCS_PASSWORD`) con políticas CSP dedicadas en Helmet para permitir la carga segura de sus componentes interactivos.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología | Versión | Propósito |
| :--- | :--- | :--- | :--- |
| **Framework Backend** | [NestJS](https://nestjs.com/) | `12.0.1` | Arquitectura modular escalable para Node.js |
| **Lenguaje** | [TypeScript](https://www.typescriptlang.org/) | `5.7+` | Tipado estático y desarrollo orientado a tipos |
| **Entorno de Ejecución** | [Node.js](https://nodejs.org/) | `22.x LTS` | Motor V8 moderno con soporte para ESM y módulos nativos |
| **ORM / Acceso a Datos** | [Prisma ORM](https://www.prisma.io/) | `7.10.0` | Modelado tipado, migraciones y extensiones |
| **Extensiones de Datos** | `@prisma/extension-read-replicas` | `0.5.0` | Balanceo de carga y aislamiento de réplicas de lectura |
| **Base de Datos Principal**| [PostgreSQL](https://www.postgresql.org/) | `16 Alpine` | Motor relacional con replicación WAL y alta integridad |
| **Caché & Concurrencia** | [Redis](https://redis.io/) / [ioredis](https://github.com/redis/ioredis) | `7.x` / `6.0` | Caché, Redlock, blacklist y soporte de colas |
| **Colas de Tareas** | [BullMQ](https://bullmq.io/) | `6.3.4` | Procesamiento asíncrono robusto en segundo plano |
| **Almacenamiento Objeto** | [SeaweedFS](https://github.com/seaweedfs/seaweedfs) / AWS S3 SDK | `v3.1129` | Bucket de archivos S3 compatible con presigned URLs |
| **Seguridad Antivirus** | [ClamAV](https://www.clamav.net/) Daemon | `Stable` | Detección de malware en caliente por TCP streaming |
| **Procesamiento Gráfico** | [Sharp](https://sharp.pixelplumbing.com/) | `0.35.4` | Conversión a WebP y redimensionado de imágenes |
| **Gateway & Audio Bot** | [Discord.js](https://discord.js.org/) + [Shoukaku](https://github.com/Deivu/Shoukaku) | `v14` / `v4` | Bot de música y eventos en tiempo real con Lavalink v4 |
| **Documentación API** | [Scalar](https://scalar.com/) OpenAPI | `1.2.18` | Interfaz moderna para especificación OpenAPI 3.1 |
| **Testing** | [Jest](https://jestjs.io/) | `30.5.1` | Suite integral de pruebas unitarias y de integración |
| **Reverse Proxy & SSL** | [NGINX](https://nginx.org/) + [Certbot](https://certbot.eff.org/) | `1.27 Alpine` | Terminación TLS, compresión gzip y renovación Let's Encrypt |
| **Firewall & Detección** | [Fail2Ban](https://www.fail2ban.org/) | `Latest` | Bloqueo automático de IPs maliciosas a nivel IPTables |

---

## 🐳 Infraestructura & Orquestación Docker

El archivo [`docker-compose.yml`](./docker-compose.yml) orquesta **13 servicios de producción** totalmente configurados con redes aisladas, volúmenes persistentes y políticas de reinicio automático:

```text
├── postgres-db         # PostgreSQL 16 Primario (WAL replica activado)
├── postgres-replica    # PostgreSQL 16 Standby (Réplica de lectura - perfil: with-replica)
├── redis               # Redis 7 con protección por contraseña
├── clamav              # Antivirus Daemon en caliente (puerto 3310)
├── seaweedfs           # Servidor S3 compatible de alto rendimiento (puertos 8333 / 9333)
├── api                 # Aplicación NestJS 12 compilada en contenedor multi-stage
├── postgres-backup     # Respaldos automatizados de base de datos (pg_dump + gzip + rotación cron)
├── storage-backup      # Respaldo periódico del almacenamiento S3
├── frontend            # Servidor Nginx que entrega la SPA en React
├── nginx               # Reverse Proxy perimetral con SSL/TLS HTTP/2
├── certbot             # Daemon para renovación automática de certificados Let's Encrypt cada 12h
├── fail2ban            # Monitoreo de logs de Nginx y baneo en firewall (red host)
├── cloudflared         # Túnel Cloudflare Zero Trust para exposición externa segura
└── lavalink            # Nodo de audio Lavalink v4 (perfil: with-lavalink)
```

---

## 📁 Estructura del Código Fuente (`src/`)

```text
src/
├── alerts/                # Monitoreo de eventos y emisión de alertas de sistema
├── api-keys/              # Gestión de llaves de API con hashing y control de expiración
├── audit/                 # Auditoría forense con cálculo de diferencias (diff JSON)
├── auth/                  # Núcleo de autenticación (JWT Dual-Token, OAuth2, Guards)
│   ├── decorators/        # Decoradores @CurrentUser, @Public, @RequirePermissions
│   ├── guards/            # JwtAuthGuard, RolesGuard, SocialAuthGuards
│   └── strategies/        # JwtStrategy (Cookies Web), JwtMobileStrategy (Bearer Mobile)
├── common/                # Capa transversal compartida
│   ├── filters/           # HttpExceptionFilter (RFC 7807 Problem Details)
│   ├── interceptors/      # IdempotencyInterceptor, Timeout, ResponseTransform
│   ├── pagination/        # Utilidades y DTOs de paginación basada en cursor y offset
│   └── pipes/             # Pipes de saneamiento y validación tipada
├── discord-bot/           # Módulo opcional de bot de música con Shoukaku y Lavalink v4
├── exports/               # Exportación masiva de datos en formatos tabulares (CSV/Excel)
├── features/              # Feature flags dinámicos en caliente persistidos en base de datos
├── files/                 # Pipeline de archivos S3, escaneo con ClamAV y optimización Sharp
├── health/                # Endpoints de salud Terminus (/api/health) con telemetría de memoria y DB
├── logs/                  # Logger con buffer diferido para persistencia de auditoría no bloqueante
├── mail/                  # Servicio de correo transaccional (Nodemailer) y plantillas
├── mobile/                # Configuración remota para la app móvil (control de versiones, force update)
├── notifications/         # Notificaciones push vía Expo y despachador en tiempo real
├── pdf/                   # Generación de reportes PDF vectoriales
├── prisma/                # PrismaService con soporte nativo de extensiones y read-replicas
├── redis/                 # Cliente Redis singleton, servicio de caché y cerrojos Redlock
├── roles/                 # Módulo de roles RBAC, jerarquía de prioridades y paginación
├── tasks/                 # Procesadores y workers en segundo plano con BullMQ
├── two-factor/            # Módulo desacoplado de 2FA TOTP (cifrado AES-256-GCM y códigos de rescate)
├── users/                 # Gestión de usuarios, perfiles de base de datos y ciclo de vida de cuentas
├── webhooks/              # Despachador de webhooks salientes con firmas HMAC y reintentos
├── websockets/            # Gateway Socket.io para comunicación bidireccional en tiempo real
├── app.module.ts          # Módulo raíz que ensambla y configura la aplicación
└── main.ts                # Bootstrap de NestJS, Helmet, CSP, Swagger y servidor HTTP
```

---

## ⚙️ Puesta en Marcha Local

### Prerrequisitos
- **Node.js**: `v22.x` o superior
- **Gestor de paquetes**: `pnpm` (`v9.x+` recomendado)
- **Docker & Docker Compose**: Para levantar los servicios auxiliares (PostgreSQL, Redis, ClamAV, SeaweedFS)

### 1. Clonar el Repositorio y Configurar Variables de Entorno
```bash
git clone git@github-personal:Nano-DevCode/nestjs-backend-core.git
cd nestjs-backend-core

# Copiar el archivo de variables de entorno base
cp .env.example .env
```

### 2. Variables de Entorno Clave (`.env`)
Configura los valores esenciales en tu archivo `.env`:

```ini
# Configuración del Servidor
PORT=3000
NODE_ENV=development
APP_NAME="Sistema Enterprise Core"
APP_URL=http://localhost:3000
FRONTEND_URL="http://localhost:5173,http://localhost:3000"

# Base de Datos PostgreSQL 16
DATABASE_URL="postgresql://postgres:MySecretPassword123@localhost:5432/sistema_db?schema=public"
# Opcional: URL de réplica de lectura
DATABASE_REPLICA_URL="postgresql://postgres:MySecretPassword123@localhost:5433/sistema_db?schema=public"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=MyRedisSecretPassword123

# Criptografía y JWT
JWT_SECRET="tu_super_jwt_secret_minimo_32_caracteres"
JWT_REFRESH_SECRET="tu_super_refresh_secret_minimo_32_caracteres"
TWO_FACTOR_ENCRYPTION_KEY="32_bytes_hex_o_string_para_aes_256_gcm"

# Almacenamiento Compatible S3 (SeaweedFS)
S3_ENDPOINT="http://localhost:8333"
S3_REGION="us-east-1"
S3_ACCESS_KEY="tu_access_key"
S3_SECRET_KEY="tu_secret_key"
S3_BUCKET="sistema-files"
S3_FORCE_PATH_STYLE=true

# Antivirus ClamAV
CLAMAV_HOST=localhost
CLAMAV_PORT=3310

# Credenciales de Documentación Privada (/api/docs)
DOCS_USER=admin
DOCS_PASSWORD=secret123

# Bot de Discord (Opcional - Feature Flag)
DISCORD_BOT_ENABLED=false
```

### 3. Levantar Servicios en Contenedores
Inicia PostgreSQL, Redis, ClamAV y SeaweedFS mediante Docker Compose:

```bash
docker compose up -d postgres-db redis clamav seaweedfs
```

> **Nota:** Si deseas levantar el entorno completo con réplicas de lectura y Lavalink para Discord:
> ```bash
> docker compose --profile with-replica --profile with-lavalink up -d
> ```

### 4. Instalar Dependencias y Sincronizar Base de Datos
```bash
# Instalar paquetes
pnpm install

# Generar cliente de Prisma y aplicar migraciones a PostgreSQL
pnpm prisma db push

# Poblar la base de datos con roles, permisos y usuario administrador
pnpm seed
```

### 5. Iniciar la Aplicación en Modo Desarrollo
```bash
pnpm run start:dev
```

La API estará lista y escuchando en `http://localhost:3000/api`.  
Accede a la documentación interactiva en **`http://localhost:3000/api/docs`** (Usuario: `admin`, Contraseña: `secret123`).

---

## 🧪 Pruebas Automatizadas y Calidad de Código

El proyecto cuenta con una cobertura integral de pruebas unitarias y de integración diseñadas bajo **Jest**:

```bash
# Ejecutar toda la suite de pruebas unitarias
pnpm run test

# Ejecutar pruebas con reporte de cobertura (LCOV / HTML)
pnpm run test:cov

# Ejecutar pruebas en modo observador continuo
pnpm run test:watch
```

### Métricas de Calidad
- **Suites de Prueba**: `119 test suites` pasando al 100%.
- **Casos de Prueba**: Más de `627 tests` ejecutados sin fallos.
- **Herramientas de Estrés y Rendimiento**:
  - `pnpm benchmark`: Ejecución de pruebas de carga HTTP.
  - `pnpm test:stress`: Pruebas de concurrencia y validación de cerrojos distribuidos.

---

## 📜 Scripts y Utilidades Operativas

| Comando | Descripción |
| :--- | :--- |
| `pnpm run build` | Compila la aplicación NestJS a JavaScript optimizado en `dist/`. |
| `pnpm run start:prod` | Ejecuta la versión compilada en modo producción. |
| `pnpm run seed` | Ejecuta el script de seeding idempotente (`main.seed.ts`). |
| `pnpm run backup:db` | Dispara el respaldo físico manual de PostgreSQL dentro del contenedor. |
| `pnpm run backup:storage`| Dispara el respaldo de los archivos almacenados en SeaweedFS. |
| `pnpm run backup:all` | Respalda conjuntamente base de datos y almacenamiento de objetos. |
| `pnpm run rotate:2fa` | Rota la clave de cifrado maestra **AES-256-GCM** de los secretos 2FA en base de datos. |
| `pnpm run reset:2fa` | Restablece las credenciales 2FA de un usuario de forma administrativa. |
| `pnpm run lint` | Ejecuta ESLint con reglas estrictas de NestJS y TypeScript. |

---

## 📖 Documentación Interna Adicional

Para profundizar en áreas específicas de la arquitectura, consulta los manuales especializados incluidos en este repositorio:

- [📚 Catálogo de Decoradores Personalizados (`DECORATORS_README.md`)](./DECORATORS_README.md) — Documentación exhaustiva de `@CurrentUser`, `@RequirePermissions`, `@AuditLog`, decoradores de parámetros y validadores.
- [📈 Guía de Calibración y Alta Concurrencia (`SCALING_TUNING_GUIDE.md`)](./SCALING_TUNING_GUIDE.md) — Matriz de dimensionamiento, calibración de Throttler, pools de base de datos y NGINX.
- [🖥️ Especificación del Frontend (`FRONTEND_SPEC_README.md`)](./FRONTEND_SPEC_README.md) — Guía de diseño de arquitectura para el cliente web React + Vite (Zustand, TanStack Table, shadcn/ui).
- [📱 Especificación para Aplicaciones Móviles (`MOBILE_BACKEND_SPEC.md`)](./MOBILE_BACKEND_SPEC.md) — Directivas técnicas de conexión para React Native / Expo, manejo de reconexiones y paginación por cursor.
- [🤖 Guía de Operación del Bot de Discord (`DISCORD_BOT_GUIDE.md`)](./DISCORD_BOT_GUIDE.md) — Manual de aprovisionamiento, arquitectura de Shoukaku y nodo Lavalink v4.

---

## 👨‍💻 Autor

Diseñado y desarrollado con dedicación y rigor de ingeniería por:

**Manuel Eduardo Santiago Feria**  
- **GitHub:** [@Nano-DevCode](https://github.com/Nano-DevCode)  
- **Email:** [mayka708.ms@gmail.com](mailto:mayka708.ms@gmail.com)  

---

## 📄 Licencia

Este software se encuentra protegido bajo una **Licencia Comercial Propietaria de Software**.  
Todos los derechos reservados. Para términos de uso, consulta el archivo [LICENSE.md](./LICENSE.md).
