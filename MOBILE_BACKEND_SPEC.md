# Especificación Técnica de Arquitectura Backend (NestJS) para React Native (Expo)

Documento maestro de especificación y directivas técnicas para el desarrollo del backend en **NestJS** diseñado para clientes móviles **React Native (Expo)**.  
**Dominio:** Sistema Empresarial de Tickets, Incidencias y Soporte Técnico en Terreno (*Field Service & Support Tickets*).

---

## 1. Visión y Desafíos Móviles

Las aplicaciones móviles operan bajo condiciones radicalmente distintas a una aplicación web:
- **Conexiones inestables:** Caídas momentáneas de red, cambio continuo de Wi-Fi a 4G/5G y pérdida de paquetes en tránsito ("desconexión en vuelo").
- **Ciclo de vida agresivo:** Suspensión por el sistema operativo (iOS/Android) en segundo plano, terminación súbita por ahorro de batería y timeouts estrictos.
- **Desincronización de versiones:** Los usuarios tardan días o semanas en actualizar la app desde App Store / Google Play.
- **Scroll Infinito:** La paginación tradicional por `OFFSET` produce elementos duplicados o saltados al insertar registros en tiempo real.

---

## 2. Arquitectura de Directorios (`src/`)

```text
src/
├── common/                          # Capa transversal compartida
│   ├── decorators/                  # @CurrentUser(), @Roles(), @Public()
│   ├── dto/                         # ApiResponse<T>, ApiErrorResponse, CursorPaginationDto
│   ├── filters/                     # GlobalExceptionFilter (RFC 7807)
│   ├── guards/                      # RolesGuard, JwtAuthGuard, CustomThrottlerGuard
│   ├── interceptors/                # TransformResponseInterceptor, IdempotencyInterceptor, TimeoutInterceptor
│   └── pipes/                       # Pipes de validación y transformación
├── config/                          # Configuraciones de entorno tipadas (Joi/Zod)
│   ├── app.config.ts
│   ├── redis.config.ts
│   └── push.config.ts
├── database/                        # ORM Prisma y modelos relacionales
│   ├── prisma.service.ts
│   └── schema.prisma
├── modules/                         # Módulos de Dominio (Vertical Slices)
│   ├── auth/                        # Autenticación JWT Dual-Token y control de sesiones
│   ├── users/                       # Perfiles y dispositivos registrados (user_devices)
│   ├── tickets/                     # Núcleo de incidencias y soporte técnico
│   ├── notifications/               # Expo Push Service con BullMQ
│   ├── uploads/                     # Presigned URLs S3 para cargas binarias directas
│   └── mobile-config/               # Version check, force update y feature flags
├── app.module.ts
└── main.ts
```

---

## 3. Contratos de Entrada y Salida

### 3.1 Respuesta Exitosa Unificada (`ApiResponse<T>`)
Todo endpoint exitoso (`200`, `201`) debe emitir la estructura:
```typescript
export interface ApiResponse<T> {
  success: true;
  statusCode: number;
  data: T;
  meta?: {
    cursor?: {
      nextCursor: string | null;
      hasNextPage: boolean;
      limit: number;
    };
    timestamp: string;
  };
}
```

### 3.2 Respuesta de Error Estandarizada (`ApiErrorResponse` - RFC 7807)
```typescript
export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  errorId: string;        // UUID único para correlación y tracking de logs
  errorCode: string;      // Código para lógica del cliente (ej. "TOKEN_EXPIRED", "DEVICE_REVOKED")
  message: string;        // Mensaje amigable para UI (Alerts/Toasts)
  details?: Array<{ field: string; issue: string }>; // Errores de Class-Validator
  timestamp: string;
  path: string;
}
```

---

## 4. Seguridad y Autenticación Dual-Token

### 4.1 Estrategia de Tokens
* **Access Token (AT):** 15 minutos de duración. Payload mínimo: `{ sub: string, email: string, role: string, deviceId: string }`.
* **Refresh Token (RT):** 30 días de duración. Se almacena el hash criptográfico (`sha256`) en la tabla `UserSession` en base de datos.
* **Rotación y Detección de Reúso:**
  - En cada llamada a `POST /api/v1/auth/refresh`, el RT anterior queda inmediatamente invalidado y se emite un nuevo par de AT + RT.
  - Si se presenta un RT que ya había sido rotado/revocado, se activa la alerta de intrusión y se invalidan **todas** las sesiones activas asociadas a ese usuario y dispositivo.
* **Almacenamiento Móvil:** En React Native (Expo) se almacena **únicamente** en `expo-secure-store`.

### 4.2 Modelo Prisma de Sesiones Móviles
```prisma
model UserSession {
  id               String    @id @default(uuid())
  userId           String
  deviceId         String    // Identificador único del dispositivo físico
  deviceName       String?   // ej: "iPhone 15 Pro", "Pixel 8"
  platform         String    // "IOS" | "ANDROID"
  hashedRt         String    // SHA-256 del Refresh Token vigente
  isRevoked        Boolean   @default(false)
  expiresAt        DateTime
  lastActiveAt     DateTime  @default(now())
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, deviceId])
  @@index([userId])
}
```

---

## 5. Paginación por Cursor para Infinite Scroll

En pantallas móviles con listas largas (`FlatList`/`FlashList`), no utilizar `OFFSET` porque produce duplicados si ingresan nuevos registros mientras el usuario navega.

### Implementación en Servicio (`tickets.service.ts`)
```typescript
async findAllPaginated(assignedUserId: string, query: { cursor?: string; limit: number }) {
  const limit = query.limit || 20;

  const items = await this.prisma.ticket.findMany({
    take: limit + 1, // Solicitar 1 extra para determinar hasNextPage
    where: {
      assignedToId: assignedUserId,
      deletedAt: null,
    },
    cursor: query.cursor ? { id: query.cursor } : undefined,
    skip: query.cursor ? 1 : 0,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      createdAt: true,
    },
  });

  let nextCursor: string | null = null;
  const hasNextPage = items.length > limit;

  if (hasNextPage) {
    items.pop();
    nextCursor = items[items.length - 1].id;
  }

  return {
    data: items,
    meta: {
      cursor: {
        nextCursor,
        hasNextPage,
        limit,
      },
    },
  };
}
```

---

## 6. Idempotencia Distribuida (`X-Idempotency-Key`)

Para prevenir envíos duplicados por micro-cortes de red celular:
1. El cliente móvil envía un UUID único en la cabecera `X-Idempotency-Key` en operaciones `POST` y `PATCH`.
2. El interceptor `IdempotencyInterceptor` adquiere un candado atómico en Redis (`SET idempotency:<userId>:<key>:lock PROCESSING EX 60 NX`).
3. Si el candado ya existe, verifica si la respuesta previa ya está en caché (`EX 86400` - 24 horas) y la devuelve de inmediato sin re-ejecutar lógica de negocio.
4. Si está en proceso, responde `409 Conflict` temporal.

---

## 7. Carga Eficiente de Archivos (Presigned URLs S3)

**Regla de Oro:** No subir archivos pesados por `multipart/form-data` al servidor de NestJS.
1. La app móvil solicita URL prefirmada: `POST /api/v1/uploads/presign` (`{ filename, mimeType, size }`).
2. El backend valida el MIME permitido y tamaño máximo (20MB), genera una clave S3 única (`tickets/evidence/<userId>/<uuid>.<ext>`) y emite una URL prefirmada `PUT` con expiración de 10 minutos vía `@aws-sdk/s3-request-presigner`.
3. El móvil sube el archivo binario directamente a AWS S3 / SeaweedFS / MinIO.
4. El móvil confirma la asociación con el ticket: `POST /api/v1/tickets/:id/attachments` (`{ fileKey, mimeType }`).

---

## 8. Notificaciones Push (Expo Push Service + BullMQ)

* Registrar dispositivos en tabla `UserDevice`:
  `{ userId, pushToken, platform: 'IOS' | 'ANDROID', appVersion, isActive }`.
* El despacho de notificaciones se procesa en segundo plano con colas de **BullMQ** (`queue:push-notifications`).
* El worker utiliza `expo-server-sdk` procesando mensajes en bloques con `chunkPushNotifications`.
* Si un ticket de entrega de Expo devuelve error `DeviceNotRegistered`, el worker actualiza automáticamente `isActive = false` en la base de datos para no enviar más peticiones a ese token.

---

## 9. Control de Versiones de la Aplicación Móvil (Force Update)

* Endpoint: `GET /api/v1/mobile/app-config`
* Cabecera requerida del cliente: `X-App-Version` (ej: `2.1.0`)
* Parámetros de consulta: `?platform=IOS` | `ANDROID`
* Comparación con librería `semver`:
  - `forceUpdate = true`: Si la versión es inferior a `MIN_SUPPORTED_VERSION` (ej. cambio incompatible en API).
  - `softUpdate = true`: Si hay una versión más nueva disponible (`LATEST_VERSION`), pero la actual sigue siendo funcional.
  - Retorna `storeUrl` para dirigir al usuario directamente a Google Play o App Store.

---

## 10. Plan de Ejecución por Fases para el Desarrollador / Agente

- **Fase 1: Capa Transversal**
  - Implementar `ApiResponse<T>`, `ApiErrorResponse` y `CursorPaginationDto`.
  - Crear `TransformResponseInterceptor` y `GlobalExceptionFilter`.
  - Configurar `main.ts` con ValidationPipe estricto, Helmet y Versionado URI (`/api/v1`).
- **Fase 2: Seguridad y Autenticación**
  - Modelo `UserSession` en `schema.prisma`.
  - Servicio `/auth/login`, `/auth/refresh` y `/auth/logout` con rotación estricta por `deviceId`.
  - Guards y decoradores: `@Roles()`, `RolesGuard`, `@CurrentUser()`.
- **Fase 3: Idempotencia y Paginación**
  - `IdempotencyInterceptor` con Redis.
  - Endpoints de consulta de tickets con cursor.
- **Fase 4: Módulos Específicos Móviles**
  - Módulo `uploads` con Presigned URLs S3.
  - Módulo `notifications` con worker BullMQ y `expo-server-sdk`.
  - Módulo `mobile-config` con validación de versión semver.
- **Fase 5: Pruebas y Compilación**
  - Validar compilación limpia con `pnpm run build`.
  - Ejecutar suite de pruebas unitarias (`.spec.ts`).

