# 📚 Catálogo Completo de Decoradores Personalizados (NestJS Backend)

Guía de referencia rápida y detallada para todos los decoradores desarrollados en el backend. Aquí encontrarás su propósito, archivo fuente, guards asociados, parámetros, qué retornan y ejemplos listos para producción.

---

## 📑 Tabla de Contenidos

1. [🛡️ Autenticación y Autorización (RBAC)](#1-️-autenticación-y-autorización-rbac)
   * [`@Roles(...)`](#rolesroles-string)
   * [`@RequirePermissions(...)`](#requirepermissionspermissions-apppermission--string)
   * [`@Public()`](#public)
2. [👤 Contexto de Usuario y Auditoría](#2--contexto-de-usuario-y-auditoría)
   * [`@CurrentUser(...)`](#currentuserproperty-keyof-userauthcontext)
   * [`@AuditContext()`](#auditcontext)
3. [🚩 Feature Flags en Tiempo Real](#3--feature-flags-en-tiempo-real)
   * [`@RequireFeature(...)`](#requirefeaturefeaturekey-featureflagkey--string)
4. [🔐 Seguridad de Doble Factor (Step-Up 2FA)](#4--seguridad-de-doble-factor-step-up-2fa)
   * [`@Require2FA()`](#require2fa)
5. [🔑 API Keys (Integración Externa M2M)](#5--api-keys-integración-externa-m2m)
   * [`@RequireApiScope(...)`](#requireapiscopescopes-string)
   * [`@CurrentApiKey()`](#currentapikey)
6. [⚡ WebSockets en Tiempo Real (Socket.IO)](#6-️-websockets-en-tiempo-real-socketio)
   * [`@WsCurrentUser(...)` / `@WsUser`](#wscurrentuserproperty-keyof-userauthcontext)
   * [`@WsClient()`](#wsclient)
   * [`@WsPayload(...)`](#wspayloadproperty-string)
   * [`@WsRoles(...)`](#wsrolesroles-string)
   * [`@WsPermissions(...)`](#wspermissionspermissions-string)
   * [`@WsRequireFeature(...)`](#wsrequirefeaturefeaturekey-string)
   * [`@WsRequire2FA()` / `@WsStepUp`](#wsrequire2fa)
   * [`@WsPublic()`](#wspublic)
7. [📖 Documentación OpenAPI / Scalar](#7--documentación-openapi--scalar)

---

## 1. 🛡️ Autenticación y Autorización (RBAC)

### `@Roles(...roles: string[])`
* **Tipo:** Decorador de Método / Clase (`SetMetadata`).
* **Archivo:** [`src/auth/decorators/auth.decorator.ts`](src/auth/decorators/auth.decorator.ts)
* **Guard Asociado:** `RolesGuard`.
* **¿Qué hace?:** Define los roles mínimos permitidos para acceder a un endpoint. Si el usuario autenticado no posee al menos uno de los roles (o privilegios equivalentes), bloquea la solicitud con `403 Forbidden`.
* **Parámetros:** Uno o varios nombres de roles en formato `string` (ej. `'admin'`, `'superadmin'`, `'user'`).
* **¿Qué retorna / inyecta?:** Asocia la metadata `'roles'` a la ruta para consumo del `Reflector`.
* **Ejemplo de uso:**
```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/auth.decorator';
import { RoleName } from '../auth/constants/roles.constant';

@Controller('admin/system')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminSystemController {
  @Get('metrics')
  @Roles(RoleName.ADMIN, RoleName.SUPERADMIN)
  getMetrics() {
    return { status: 'healthy', memoryUsage: '45%' };
  }
}
```

---

### `@RequirePermissions(...permissions: (AppPermission | string)[])`
* **Tipo:** Decorador de Método / Clase (`SetMetadata`).
* **Archivo:** [`src/auth/decorators/auth.decorator.ts`](src/auth/decorators/auth.decorator.ts)
* **Guard Asociado:** `PermissionsGuard` y `RolesGuard`.
* **¿Qué hace?:** Aplica control de acceso basado en permisos granulares (RBAC). El usuario debe tener asignados todos los permisos especificados (soporta formato con puntos `users.read` o dos puntos `users:read`).
* **Parámetros:** Lista de slugs de permisos o miembros del enum `AppPermission`.
* **¿Qué retorna / inyecta?:** Registra la metadata `'permissions'`.
* **Ejemplo de uso:**
```typescript
import { Controller, Delete, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/auth.decorator';
import { AppPermission } from '../auth/constants/permissions.constant';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  @Delete(':id')
  @RequirePermissions(AppPermission.USERS_DELETE)
  deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }
}
```

---

### `@Public()`
* **Tipo:** Decorador de Método / Clase (`SetMetadata`).
* **Archivo:** [`src/auth/decorators/auth.decorator.ts`](src/auth/decorators/auth.decorator.ts)
* **Guard Asociado:** `JwtAuthGuard` y `RolesGuard`.
* **¿Qué hace?:** Omite la validación obligatoria del JWT. Permite que cualquier cliente anónimo acceda al endpoint sin token Bearer ni cookie de sesión.
* **Parámetros:** Ninguno.
* **¿Qué retorna / inyecta?:** Asocia la clave de metadata `'isPublic': true`.
* **Ejemplo de uso:**
```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { Public } from '../auth/decorators/auth.decorator';
import { LoginDto } from '../auth/dto/login.dto';

@Controller('auth')
export class AuthController {
  @Post('login')
  @Public() // 👈 No requiere JWT
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
```

---

## 2. 👤 Contexto de Usuario y Auditoría

### `@CurrentUser(property?: keyof UserAuthContext)`
* **Tipo:** Decorador de Parámetro (`createParamDecorator`).
* **Archivo:** [`src/common/decorators/current-user.decorator.ts`](src/common/decorators/current-user.decorator.ts)
* **Requisito previo:** La ruta debe estar protegida con `JwtAuthGuard` (de lo contrario lanza `500 InternalServerErrorException`).
* **¿Qué hace?:** Extrae el objeto del usuario autenticado almacenado en `request.user` por Passport. Permite solicitar el usuario completo o un campo específico.
* **Parámetros:** (Opcional) Una propiedad de `UserAuthContext` (ej. `'id'`, `'email'`, `'roles'`).
* **¿Qué retorna?:**
  * Sin argumento: El objeto completo `UserAuthContext` (`{ id, email, roles, permissions, priority }`).
  * Con argumento: El valor del campo especificado (ej. `userId: string`).
* **Ejemplo de uso:**
```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UserAuthContext } from '../auth/interfaces/auth.interface';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  @Get('full')
  getMyProfile(@CurrentUser() user: UserAuthContext) {
    return { profile: user };
  }

  @Get('id')
  getMyId(@CurrentUser('id') userId: string) {
    return { id: userId };
  }
}
```

---

### `@AuditContext()`
* **Tipo:** Decorador de Parámetro (`createParamDecorator`).
* **Archivo:** [`src/common/decorators/audit-context.decorator.ts`](src/common/decorators/audit-context.decorator.ts)
* **¿Qué hace?:** Extrae automáticamente la metadata de red y cliente forense para auditoría: dirección IP real (resolviendo proxies inversos con `x-forwarded-for`), `User-Agent`, método HTTP (`GET`, `POST`, etc.), la URL o endpoint llamado, y el `userId` si la petición está autenticada.
* **Parámetros:** Ninguno.
* **¿Qué retorna?:** Un objeto con la interfaz `AuditMetadata`:
  ```typescript
  {
    userId?: string;
    ipAddress: string;
    userAgent?: string;
    method: string;
    endpoint: string;
  }
  ```
* **Ejemplo de uso:**
```typescript
import { Controller, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditContext, AuditMetadata } from '../common/decorators/audit-context.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersAuditController {
  @Patch(':id/status')
  async toggleStatus(
    @Param('id') targetId: string,
    @Body('isActive') isActive: boolean,
    @AuditContext() auditMeta: AuditMetadata,
  ) {
    return this.usersService.updateStatus(targetId, isActive, auditMeta);
  }
}
```

---

## 3. 🚩 Feature Flags en Tiempo Real

### `@RequireFeature(featureKey: FeatureFlagKey | string)`
* **Tipo:** Decorador de Método / Clase (`SetMetadata`).
* **Archivo:** [`src/features/decorators/require-feature.decorator.ts`](src/features/decorators/require-feature.decorator.ts)
* **Guard Asociado:** `FeatureFlagGuard`.
* **¿Qué hace?:** Restringe el acceso al endpoint evaluando el estado del Feature Flag en Redis y PostgreSQL. Si la bandera está en `false`, responde inmediatamente `403 Forbidden` con el mensaje de funcionalidad deshabilitada.
* **Parámetros:** El identificador del flag del enum `FeatureFlagKey` o string canónico.
* **¿Qué retorna / inyecta?:** Asocia la clave de metadata `'require_feature'`.
* **Ejemplo de uso:**
```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { FeatureFlagGuard } from '../features/guards/feature-flag.guard';
import { RequireFeature } from '../features/decorators/require-feature.decorator';
import { FeatureFlagKey } from '../features/constants/feature-flags.constant';

@Controller('beta-tools')
@UseGuards(FeatureFlagGuard)
export class BetaToolsController {
  @Get('experiment')
  @RequireFeature(FeatureFlagKey.BETA_FEATURE)
  runExperiment() {
    return { ok: true, message: 'Acceso concedido a herramienta experimental' };
  }
}
```

---

## 4. 🔐 Seguridad de Doble Factor (Step-Up 2FA)

### `@Require2FA()`
* **Tipo:** Decorador de Método / Clase (`SetMetadata`).
* **Archivo:** [`src/two-factor/decorators/require-2fa.decorator.ts`](src/two-factor/decorators/require-2fa.decorator.ts)
* **Guard Asociado:** `TwoFactorGuard`.
* **¿Qué hace?:** Protege operaciones críticas (cambio de contraseña, eliminación de cuenta, exportación de datos sensibles). Exige que el usuario envíe su código TOTP de 6 dígitos en el encabezado `x-2fa-code` o en el cuerpo `{ code: "123456" }`.
* **Parámetros:** Ninguno.
* **¿Qué retorna / inyecta?:** Asocia la clave de metadata `'require2FA': true`.
* **Ejemplo de uso:**
```typescript
import { Controller, Delete, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TwoFactorGuard } from '../two-factor/guards/two-factor.guard';
import { Require2FA } from '../two-factor/decorators/require-2fa.decorator';

@Controller('security')
@UseGuards(JwtAuthGuard, TwoFactorGuard)
export class SecurityController {
  @Delete('purge-data')
  @Require2FA() // 👈 Exige código TOTP en x-2fa-code
  async purgeAccountData() {
    return { success: true, message: 'Operación validada con 2FA exitosa' };
  }
}
```

---

## 5. 🔑 API Keys (Integración Externa M2M)

### `@RequireApiScope(...scopes: string[])`
* **Tipo:** Decorador de Método / Clase (`SetMetadata`).
* **Archivo:** [`src/api-keys/decorators/api-key.decorator.ts`](src/api-keys/decorators/api-key.decorator.ts)
* **Guard Asociado:** `ApiKeyGuard`.
* **¿Qué hace?:** Restringe llamadas autenticadas con API Key (header `x-api-key`) exigiendo que la clave cuente con los permisos/ámbitos requeridos.
* **Parámetros:** Uno o varios scopes en formato string (ej. `'files:read'`, `'webhooks:send'`).
* **¿Qué retorna / inyecta?:** Registra la metadata `'api_key_scopes'`.
* **Ejemplo de uso:**
```typescript
import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { RequireApiScope } from '../api-keys/decorators/api-key.decorator';

@Controller('external/webhooks')
@UseGuards(ApiKeyGuard)
export class ExternalWebhookController {
  @Post('receive')
  @RequireApiScope('webhooks:write')
  receiveWebhook() {
    return { received: true };
  }
}
```

---

### `@CurrentApiKey()`
* **Tipo:** Decorador de Parámetro (`createParamDecorator`).
* **Archivo:** [`src/api-keys/decorators/api-key.decorator.ts`](src/api-keys/decorators/api-key.decorator.ts)
* **¿Qué hace?:** Inyecta la entidad `ApiKeyRecord` validada previamente por `ApiKeyGuard` desde `request.apiKey`.
* **Parámetros:** Ninguno.
* **¿Qué retorna?:** Objeto con la información de la API Key:
  ```typescript
  {
    id: string;
    name: string;
    keyPrefix: string;
    scopes: string[];
    rateLimit: number;
    ownerId?: string;
  }
  ```
* **Ejemplo de uso:**
```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { CurrentApiKey } from '../api-keys/decorators/api-key.decorator';
import type { ApiKeyRecord } from '../api-keys/interfaces/api-key.interface';

@Controller('external/info')
@UseGuards(ApiKeyGuard)
export class ExternalInfoController {
  @Get('quota')
  getQuota(@CurrentApiKey() apiKey: ApiKeyRecord) {
    return {
      key: apiKey.keyPrefix,
      allowedScopes: apiKey.scopes,
      rateLimitPerMin: apiKey.rateLimit,
    };
  }
}
```

---

## 6. ⚡ WebSockets en Tiempo Real (Socket.IO)

Todos estos decoradores están diseñados específicamente para su uso dentro de Gateways de WebSocket ([`@WebSocketGateway`](https://docs.nestjs.com/websockets/gateways)) y manejadores de mensajes (`@SubscribeMessage`).

---

### `@WsCurrentUser(property?: keyof UserAuthContext)`
* **Alias:** `@WsUser(...)`
* **Tipo:** Decorador de Parámetro (`createParamDecorator`).
* **Archivo:** [`src/websockets/decorators/ws-current-user.decorator.ts`](src/websockets/decorators/ws-current-user.decorator.ts)
* **¿Qué hace?:** Extrae el usuario autenticado del cliente Socket.IO conectado (`client.data.user` o `client.user`). Si el socket no está autenticado, arroja un `WsException`.
* **Parámetros:** (Opcional) Nombre de la propiedad del usuario (ej. `'id'`, `'email'`).
* **¿Qué retorna?:** `UserAuthContext` o el valor del campo pedido.
* **Ejemplo de uso:**
```typescript
import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '../websockets/guards/ws-jwt.guard';
import { WsCurrentUser } from '../websockets/decorators/ws-current-user.decorator';

@WebSocketGateway({ namespace: '/realtime/chat' })
@UseGuards(WsJwtGuard)
export class ChatGateway {
  @SubscribeMessage('send_message')
  handleMessage(
    @WsCurrentUser('id') senderId: string,
    @WsCurrentUser('email') senderEmail: string,
  ) {
    console.log(`Mensaje enviado por ${senderEmail} (${senderId})`);
  }
}
```

---

### `@WsClient()`
* **Tipo:** Decorador de Parámetro (`createParamDecorator`).
* **Archivo:** [`src/websockets/decorators/ws-client.decorator.ts`](src/websockets/decorators/ws-client.decorator.ts)
* **¿Qué hace?:** Inyecta el socket cliente tipado `AuthenticatedSocket` directamente en el método.
* **Parámetros:** Ninguno.
* **¿Qué retorna?:** La instancia del cliente `Socket` conectada.
* **Ejemplo de uso:**
```typescript
import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { WsClient } from '../websockets/decorators/ws-client.decorator';
import type { AuthenticatedSocket } from '../websockets/interfaces/authenticated-socket.interface';

@WebSocketGateway()
export class PingGateway {
  @SubscribeMessage('ping')
  handlePing(@WsClient() client: AuthenticatedSocket) {
    client.emit('pong', { timestamp: Date.now() });
  }
}
```

---

### `@WsPayload(property?: string)`
* **Tipo:** Decorador de Parámetro (`createParamDecorator`).
* **Archivo:** [`src/websockets/decorators/ws-client.decorator.ts`](src/websockets/decorators/ws-client.decorator.ts)
* **¿Qué hace?:** Inyecta los datos enviados por el cliente en el evento WebSocket, con soporte para extraer una propiedad específica directamente.
* **Parámetros:** (Opcional) Nombre de la propiedad del objeto recibido.
* **¿Qué retorna?:** El objeto de carga útil completo o el valor del atributo solicitado.
* **Ejemplo de uso:**
```typescript
import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { WsPayload } from '../websockets/decorators/ws-client.decorator';

@WebSocketGateway()
export class RoomGateway {
  @SubscribeMessage('join_room')
  handleJoin(
    @WsPayload('roomId') roomId: string,
    @WsPayload() fullData: Record<string, unknown>,
  ) {
    console.log('Unirse a sala:', roomId, fullData);
  }
}
```

---

### `@WsRoles(...roles: string[])`
* **Tipo:** Decorador de Método / Clase (`SetMetadata`).
* **Archivo:** [`src/websockets/decorators/ws-auth.decorator.ts`](src/websockets/decorators/ws-auth.decorator.ts)
* **Guard Asociado:** `WsRolesGuard`.
* **¿Qué hace?:** Exige que el socket pertenezca a un usuario con al menos uno de los roles especificados para poder ejecutar el evento.
* **Parámetros:** Lista de nombres de roles (`'admin'`, `'superadmin'`).
* **Ejemplo de uso:**
```typescript
@SubscribeMessage('system_alert')
@WsRoles('admin', 'superadmin')
handleAlert() { ... }
```

---

### `@WsPermissions(...permissions: string[])`
* **Tipo:** Decorador de Método / Clase (`SetMetadata`).
* **Archivo:** [`src/websockets/decorators/ws-auth.decorator.ts`](src/websockets/decorators/ws-auth.decorator.ts)
* **Guard Asociado:** `WsPermissionsGuard`.
* **¿Qué hace?:** Exige permisos específicos en el socket del usuario para procesar el mensaje.
* **Parámetros:** Lista de permisos (`'files.upload'`, `'users.read'`).
* **Ejemplo de uso:**
```typescript
@SubscribeMessage('trigger_export')
@WsPermissions('reports.export')
handleExport() { ... }
```

---

### `@WsRequireFeature(featureKey: string)`
* **Tipo:** Decorador de Método / Clase (`SetMetadata`).
* **Archivo:** [`src/websockets/decorators/ws-feature.decorator.ts`](src/websockets/decorators/ws-feature.decorator.ts)
* **Guard Asociado:** `WsFeatureFlagGuard`.
* **¿Qué hace?:** Verifica que un Feature Flag esté activo antes de atender un evento WebSocket.
* **Parámetros:** Nombre del Feature Flag (ej. `'REALTIME_ANALYTICS'`).
* **Ejemplo de uso:**
```typescript
@SubscribeMessage('track_activity')
@WsRequireFeature('REALTIME_ANALYTICS')
handleTracking() { ... }
```

---

### `@WsRequire2FA()`
* **Alias:** `@WsStepUp()`
* **Tipo:** Decorador de Método / Clase (`SetMetadata`).
* **Archivo:** [`src/websockets/decorators/ws-2fa.decorator.ts`](src/websockets/decorators/ws-2fa.decorator.ts)
* **Guard Asociado:** `WsTwoFactorGuard`.
* **¿Qué hace?:** Exige que el evento WebSocket venga acompañado de un código TOTP de doble factor (enviado en el header `x-2fa-code` del handshake o dentro del payload `{ code: "123456" }`).
* **Parámetros:** Ninguno.
* **Ejemplo de uso:**
```typescript
@SubscribeMessage('purge_database')
@WsRequire2FA()
handlePurge() { ... }
```

---

### `@WsPublic()`
* **Tipo:** Decorador de Método / Clase (`SetMetadata`).
* **Archivo:** [`src/websockets/decorators/ws-auth.decorator.ts`](src/websockets/decorators/ws-auth.decorator.ts)
* **Guard Asociado:** `WsJwtGuard`.
* **¿Qué hace?:** Hace público un Gateway o evento específico de WebSocket sin exigir handshake autenticado con JWT.
* **Parámetros:** Ninguno.
* **Ejemplo de uso:**
```typescript
@SubscribeMessage('public_announcements')
@WsPublic()
handleAnnouncements() { ... }
```

---

## 7. 📖 Documentación OpenAPI / Scalar

En [`src/common/scalar/scalar.decorators.ts`](src/common/scalar/scalar.decorators.ts) se reexportan los decoradores estándar de OpenAPI desacoplados para la integración con **Scalar API Reference**:

* `@ApiTags('NombreGrupo')`: Agrupa endpoints en secciones visuales.
* `@ApiOperation({ summary: '...' })`: Describe la acción del endpoint.
* `@ApiResponse({ status: 200, type: MiDto })`: Especifica esquemas y códigos de respuesta.
* `@ApiProperty({ example: '...' })`: Documenta atributos dentro de clases DTO.
* `@ApiBearerAuth()`: Indica autenticación vía cabecera `Authorization: Bearer <token>`.
* `@ApiCookieAuth()`: Indica autenticación vía Cookie segura HttpOnly.
* `@ApiConsumes('multipart/form-data')`: Declara endpoints de subida de archivos binarios.

---

## 📊 Matriz Resumen de Decoradores

| Decorador | Tipo | Protocolo | Guard que lo valida | Qué Inyecta / Efecto |
| :--- | :---: | :---: | :---: | :--- |
| **`@Roles(...)`** | Metadata | HTTP | `RolesGuard` | Restringe por roles mínimos |
| **`@RequirePermissions(...)`** | Metadata | HTTP | `PermissionsGuard` / `RolesGuard` | Restringe por permisos RBAC |
| **`@Public()`** | Metadata | HTTP | `JwtAuthGuard` | Hace el endpoint accesible sin token |
| **`@CurrentUser(...)`** | Parámetro | HTTP | *Consume `request.user`* | Inyecta usuario autenticado o atributo |
| **`@AuditContext()`** | Parámetro | HTTP | *N/A (Extracción)* | Inyecta IP real, User-Agent, ruta, etc. |
| **`@RequireFeature(...)`** | Metadata | HTTP | `FeatureFlagGuard` | Bloquea si la flag está apagada |
| **`@Require2FA()`** | Metadata | HTTP | `TwoFactorGuard` | Exige token TOTP para Step-Up Auth |
| **`@RequireApiScope(...)`** | Metadata | HTTP | `ApiKeyGuard` | Exige scopes específicos en la API Key |
| **`@CurrentApiKey()`** | Parámetro | HTTP | *Consume `request.apiKey`* | Inyecta entidad `ApiKeyRecord` |
| **`@WsCurrentUser(...)`** | Parámetro | WS | *Consume `client.data.user`* | Inyecta usuario en Socket.IO |
| **`@WsClient()`** | Parámetro | WS | *N/A (Extracción)* | Inyecta cliente socket conectado |
| **`@WsPayload(...)`** | Parámetro | WS | *N/A (Extracción)* | Inyecta datos recibidos del mensaje WS |
| **`@WsRoles(...)`** | Metadata | WS | `WsRolesGuard` | Restringe eventos WS por roles |
| **`@WsPermissions(...)`** | Metadata | WS | `WsPermissionsGuard` | Restringe eventos WS por permisos |
| **`@WsRequireFeature(...)`** | Metadata | WS | `WsFeatureFlagGuard` | Bloquea evento WS si la flag está apagada |
| **`@WsRequire2FA()`** | Metadata | WS | `WsTwoFactorGuard` | Exige código 2FA en mensaje WS |
| **`@WsPublic()`** | Metadata | WS | `WsJwtGuard` | Permite evento WS sin token |

