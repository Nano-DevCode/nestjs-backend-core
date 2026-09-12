# Guía Maestra para el Agente Antigravity: Frontend React + Vite + TypeScript
## Sistema SaaS Empresarial & Administrativo (RBAC, Archivos S3, Auditoría, 2FA y Feature Flags)

> **Instrucción para el Agente de Antigravity:**  
> Actúa como un **Tech Lead Frontend & Senior Product Designer**. Tu objetivo es construir desde cero un cliente web empresarial de grado SaaS premium conectando al backend de NestJS existente: **Gestión de Usuarios y Roles RBAC, Explorador de Archivos en S3/SeaweedFS con Antivirus ClamAV y WebP, Trazabilidad y Auditoría con Visor JSON Diff, Autenticación en Dos Pasos (2FA) Desacoplada, Feature Flags en Caliente y Observabilidad de Infraestructura**.  
> El sistema debe ser **ultra-responsivo (Mobile-First y Desktop)**, implementar tablas interactivas virtualizadas con **TanStack Table + Virtual**, componentes accesibles y limpios con **shadcn/ui**, microinteracciones con **Framer Motion**, gráficos con **Recharts**, persistencia con **Zustand**, arquitectura de **Actions desacopladas**, **protección absoluta contra traductores de navegador (Google Translate)** y carga diferida con **Skeletons adaptativos**.
> 
> *Nota de arquitectura:* El módulo de **Autenticación en Dos Pasos (2FA/MFA)** está desacoplado del módulo de login y reside como un dominio independiente en el backend (`/auth/2fa`), por lo que en el frontend debe estructurarse en su propia feature dedicada (`features/two-factor/`), separada de `features/auth/`.

---

## 1. Stack Tecnológico Definitivo (Nivel SaaS Premium)

### A. Núcleo de Estilos, Componentes y Look Moderno
- **Tailwind CSS v4 / v3:** Sistema base de diseño atómico y utilidades.
- **shadcn/ui (Radix UI por debajo):** El estándar de oro para SaaS modernos. Proporciona componentes accesibles y con código fuente directo en el proyecto:
  - Modales (`Dialog`), pestañas (`Tabs`), menús contextuales (`DropdownMenu`), badges, avatares, tooltips ultrafluidos y `InputOTP` para códigos de 6 dígitos.
  - Modo Oscuro / Modo Claro con transiciones suaves utilizando `next-themes` adaptado a Vite.
- **Magic UI / Aceternity UI (Patrones de Diseño Premium):**
  - Fondos sutiles: rejillas punteadas (*dot grid*), mallas geométricas y gradientes animados tenues para el login y paneles de administración.
  - Bordes brillantes (*shimmer buttons*) y tarjetas con efecto *glow* o disposición *Bento Grid* para el dashboard de bienvenida.
- **Lucide React (`lucide-react`):** Set de iconos consistente, limpio y ligero (usuarios, llaves RBAC, candados 2FA, nubes S3, escudos antivirus, diff logs, etc.).

### B. Tablas de Datos Virtualizadas y Gestión de Registros
- **TanStack Table v8 (`@tanstack/react-table`):**
  - Tablas interactivas con ordenamiento multicolumna, búsqueda en vivo, filtros por roles/permisos, paginación y selección múltiple para asignación masiva de permisos o borrado de archivos.
- **TanStack Virtual (`@tanstack/react-virtual`):**
  - Virtualización de listas para auditorías con miles de eventos o directorios de usuarios extensos, manteniendo un scroll a 60 FPS sin saturar el DOM.
- **Skeletons Animados (`shadcn/ui Skeleton`):**
  - Siluetas pulsantes con la forma exacta de las tablas y tarjetas mientras cargan los datos, eliminando pantallas en blanco.

### C. Formularios, Validación y Notificaciones
- **React Hook Form + Zod (`@hookform/resolvers/zod`):**
  - Manejo de formularios de alto rendimiento sin re-renderizar toda la pantalla.
  - Validación en cliente con esquemas Zod que replican con exactitud los DTOs de `class-validator` del backend.
- **Sonner (`sonner`):**
  - Sistema de notificaciones toast interactivo y responsivo con soporte para promesas y progreso en vivo:  
    `"Subiendo archivo a S3... (70%)"` $\rightarrow$ `"¡Verificado por ClamAV y guardado!"`.

### D. Capa de Datos, Estado Global y Red
- **TanStack Query v5 (`@tanstack/react-query`):**
  - Caché de servidor, revalidación en segundo plano, reintentos con backoff exponencial y **mutaciones optimistas**.
- **Axios con Interceptores:**
  - Instancia central `apiClient` con `withCredentials: true` para envío automático de cookies HttpOnly (`access_token`, `refresh_token`, `trusted_device`).
  - Renovación automática de tokens ante respuestas `401 Unauthorized`.
  - Inyección automática de la cabecera `Idempotency-Key` (UUIDv4) en peticiones `POST`, `PUT` y `PATCH`.
- **Zustand + Middleware `persist`:**
  - Manejo de estado global persistente en `localStorage` o `sessionStorage` para no perder la sesión ni preferencias visuales ante recargas (`F5`).

### E. Métricas, Gráficos y Microinteracciones
- **Recharts:**
  - Dashboard de observabilidad, estadísticas de uso de almacenamiento S3, eventos de auditoría por día y distribución de roles.
- **Framer Motion (`framer-motion`):**
  - Transiciones suaves entre páginas, apertura elástica de modales y cajones que se deslizan fluidamente sin cortes bruscos.

### F. Optimización de Rendimiento, Lazy Loading y Skeletons
- **Code-Splitting y Carga Diferida (`React.lazy` + `Suspense`):**
  - Todas las rutas y módulos pesados (Usuarios, Auditoría, Archivos S3, 2FA, Health, Feature Flags) se cargan bajo demanda.
- **Pantalla de Carga Inicial Branded (App Resource Preloader):**
  - Vista de arranque elegante mientras se inicializa la web y se verifica el estado de la sesión (`/auth/refresh`).
- **Skeletons Adaptativos (`shadcn/ui Skeleton`):**
  - Cero saltos visuales de interfaz (Zero CLS - Cumulative Layout Shift).

---

## 2. Protección Crítica Anti-Crash: Google Translate y Traductores de Navegador

> [!CAUTION]
> **El problema fatal de los traductores automáticos (Chrome / Edge / Google Translate):**  
> Cuando el traductor del navegador está activado, analiza el DOM y reemplaza o envuelve directamente los nodos de texto de texto con etiquetas `<font>`. Cuando React intenta re-renderizar o reconciliar el Virtual DOM, no encuentra los nodos de texto originales y lanza errores fatales no capturados:  
> `NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.`  
> o `Failed to execute 'insertBefore' on 'Node'...`  
> **Esto destruye el árbol de React y deja la página completamente en blanco (White Screen of Death).**

Para blindar la aplicación de forma definitiva, el frontend **DEBE implementar las siguientes 4 capas de protección obligatorias**:

### Capa 1: Atributos HTML y Meta Tags Anti-Traductor en `index.html`
Indica a los navegadores y a los rastreadores de Google que no deben alterar el DOM de la aplicación:
```html
<!doctype html>
<html lang="es" translate="no" class="notranslate">
  <head>
    <meta charset="UTF-8" />
    <meta name="google" content="notranslate" />
    <!-- ... resto del head ... -->
  </head>
  <body class="notranslate">
    <div id="root" class="notranslate"></div>
  </body>
</html>
```

### Capa 2: Regla de Oro en JSX (Encapsulación Estricta de Textos Dinámicos)
**NUNCA** coloques texto estático y variables dinámicas juntos como nodos de texto huérfanos adyacentes.

```tsx
// ❌ INCORRECTO: Provoca crash fatal si Google Translate envuelve el texto
<div>Total de usuarios: {totalCount}</div>
<p>Bienvenido, {user.name}!</p>
{isLoading && "Cargando..."}

// ✅ CORRECTO: Cada texto dinámico y estático está en su propio contenedor
<div>
  <span>Total de usuarios:</span> <span>{totalCount}</span>
</div>
<p>
  <span>Bienvenido,</span> <span>{user.name}</span>!
</p>
{isLoading ? <span>Cargando...</span> : null}
```

### Capa 3: Clase `.notranslate` en Componentes Críticos de UI
En componentes con alta tasa de re-renderizado (tablas TanStack, badges, contadores numéricos y modales), añade siempre la clase `notranslate`:
```tsx
<div className="notranslate font-mono text-sm">
  <span>{log.ipAddress}</span>
</div>
```

### Capa 4: Polyfill Defensivo a Nivel DOM en `src/main.tsx`
Agrega este parche defensivo antes del renderizado de React en `src/main.tsx`. Si Google Translate altera los nodos antes de una reconciliación de React, el parche previene el crash capturando la inconsistencia con gracia:

```typescript
// src/main.tsx (o polyfills.ts al inicio de la aplicación)
if (typeof window !== 'undefined') {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      if (console) {
        console.warn('Google Translate intentó remover un nodo que no es hijo directo. Operación interceptada con éxito.');
      }
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (console) {
        console.warn('Google Translate intentó insertar antes de un nodo ajeno. Operación interceptada con éxito.');
      }
      return newNode;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}
```

---

## 3. Estructura de Directorios Modular en Vite

El proyecto debe estructurarse por dominios de negocio dentro de `src/features/`. Observa que el módulo de **2FA** se encuentra como un dominio propio, desacoplado de `auth`:

```
src/
├── api/                     # Instancia Axios con interceptores, endpoints y tipos base
│   ├── client.ts            # withCredentials: true, auto-refresh 401, idempotencia
│   └── endpoints.ts         # URLs centralizadas del backend
├── assets/                  # Logos institucionales, ilustraciones y gradientes
├── components/
│   ├── ui/                  # Componentes base de shadcn/ui (Button, Dialog, Input, etc.)
│   ├── layout/              # Sidebar retráctil, Navbar, Breadcrumbs, UserDropdown, BottomNav
│   └── shared/              # ResponsiveDialog, BentoGrid, ShimmerButton, Skeletons
├── features/                # Módulos por dominio de negocio (arquitectura modular)
│   ├── auth/                # Login, registro, verificación de email, refresh, logout
│   ├── two-factor/          # Dominio independiente: configuración TOTP QR, reto 2FA y Step-Up
│   │   ├── actions/         # Funciones asíncronas puras de red (generateSecretAction, etc.)
│   │   ├── hooks/           # Custom hooks de TanStack Query/Mutation que llaman a las actions
│   │   ├── components/      # Modales QR, InputOTP, BackupCodesGrid, StepUpModal
│   │   └── types/           # Interfaces DTO y esquemas Zod del dominio 2FA
│   ├── users/               # Gestión de usuarios, asignación de roles y permisos RBAC
│   │   ├── actions/         # users.actions.ts (fetchUsersAction, toggleUserStatusAction, assignRoleAction)
│   │   ├── hooks/           # useUsersQuery.ts, useUpdateUserMutation.ts
│   │   └── components/      # UsersTable.tsx, UserRoleDialog.tsx, MobileUserDrawer.tsx
│   ├── files/               # Gestor S3/SeaweedFS, escaneo antivirus ClamAV y optimización WebP
│   │   ├── actions/         # uploadFileAction, uploadMultipleFilesAction, deleteFileAction
│   │   ├── hooks/           # useFileUploadMutation.ts con progreso de carga
│   │   └── components/      # FileDropzone.tsx, FileGallery.tsx, FilePreviewModal.tsx
│   ├── audit/               # Trazabilidad y logs con visor de diff JSON
│   │   ├── actions/         # fetchAuditLogsAction.ts
│   │   ├── hooks/           # useAuditLogsQuery.ts
│   │   └── components/      # AuditLogTable.tsx, JsonDiffViewerModal.tsx
│   ├── health/              # Monitor en vivo del backend (PostgreSQL, Redis, SeaweedFS)
│   │   ├── actions/         # fetchHealthStatusAction.ts
│   │   └── hooks/           # useHealthCheckQuery.ts (polling cada 30s)
│   └── feature-flags/       # Gestión y consumo reactivo de flags en caliente
│       ├── actions/         # fetchFeatureFlagsAction.ts, toggleFeatureFlagAction.ts
│       └── hooks/           # useFeatureFlag.ts, useFeatureFlagsMutation.ts
├── hooks/                   # Custom hooks globales (useMediaQuery, useStepUpAuth, etc.)
├── stores/                  # Stores de Zustand con persistencia (useAuthStore, useUIStore)
├── types/                   # Contratos TypeScript globales sincronizados con el backend
└── router/                  # Configuración de rutas con React.lazy() y Suspense
```

### B. El Patrón Arquitectónico Obligatorio: Componentes $\rightarrow$ Hooks $\rightarrow$ Actions $\rightarrow$ API Client

Para garantizar mantenibilidad, testing aislado y cero acoplamiento:
1. **`actions/` (Capa de Acciones Puras):**
   - Son funciones asíncronas puras (`async/await`) que interactúan directamente con `apiClient`.
   - **No contienen estado de React ni hooks.**
   - Reciben parámetros tipados, preparan `FormData` o payloads JSON, y retornan datos fuertemente tipados.
2. **`hooks/` (Capa Reactiva & TanStack Query):**
   - Son custom hooks de React (`useQuery`, `useMutation`).
   - **Son los únicos autorizados a llamar a las funciones de `actions/`.**
   - Gestionan claves de caché (`queryKey`), políticas de revalidación, actualizaciones optimistas en la UI y disparan notificaciones toast con Sonner.
3. **`components/` (Capa Visual de UI):**
   - Consumen exclusivamente los custom hooks.
   - **Tienen estrictamente prohibido importar `apiClient` o hacer `fetch/axios` directo.**

#### Ejemplo Práctico: Gestión de Usuarios y Roles RBAC (`features/users/`)

**1. Acción de red pura (`features/users/actions/users.actions.ts`):**
```typescript
import { apiClient } from '@/api/client';
import type { UserRecord, ToggleUserStatusDto } from '../types';

export const toggleUserStatusAction = async (dto: ToggleUserStatusDto): Promise<UserRecord> => {
  const response = await apiClient.patch<UserRecord>(`/users/${dto.userId}/status`, {
    isActive: dto.isActive,
  });
  return response.data;
};

export const fetchUsersAction = async (): Promise<UserRecord[]> => {
  const response = await apiClient.get<UserRecord[]>('/users');
  return response.data;
};
```

**2. Custom Hook que invoca la acción (`features/users/hooks/use-update-user-mutation.ts`):**
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toggleUserStatusAction } from '../actions/users.actions';
import type { ToggleUserStatusDto, UserRecord } from '../types';

export const useToggleUserStatusMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: ToggleUserStatusDto) => toggleUserStatusAction(dto),
    // Mutación optimista: el switch de estado cambia al instante
    onMutate: async (updatedUser) => {
      await queryClient.cancelQueries({ queryKey: ['users'] });
      const previousUsers = queryClient.getQueryData<UserRecord[]>(['users']);

      queryClient.setQueryData<UserRecord[]>(['users'], (old = []) =>
        old.map((u) => (u.id === updatedUser.userId ? { ...u, isActive: updatedUser.isActive } : u)),
      );

      return { previousUsers };
    },
    onError: (_err, _updatedUser, context) => {
      if (context?.previousUsers) {
        queryClient.setQueryData(['users'], context.previousUsers);
      }
      toast.error('Error al actualizar el estado del usuario');
    },
    onSuccess: () => {
      toast.success('Estado de usuario actualizado con éxito');
    },
  });
};
```

**3. Componente de UI que solo consume el hook (`features/users/components/UserStatusSwitch.tsx`):**
```tsx
import { Switch } from '@/components/ui/switch';
import { useToggleUserStatusMutation } from '../hooks/use-update-user-mutation';

export const UserStatusSwitch = ({ userId, isActive }: { userId: string; isActive: boolean }) => {
  const { mutate: toggleStatus, isPending } = useToggleUserStatusMutation();

  return (
    <div className="notranslate flex items-center gap-2">
      <Switch
        checked={isActive}
        disabled={isPending}
        onCheckedChange={(checked) => {
          toggleStatus({ userId, isActive: checked });
        }}
      />
      <span className="text-xs text-muted-foreground">
        {isActive ? 'Activo' : 'Suspendido'}
      </span>
    </div>
  );
};
```

---

## 4. Matriz Visual: ¿Qué hace el Backend y Cómo lo Resuelve el Frontend Visualmente?

Esta matriz vincula cada capacidad desarrollada en el backend de NestJS con su representación gráfica, componentes de UI y microinteracciones exactas en el cliente React:

| Módulo Backend | Lo que Hace el Backend (NestJS / DB / Redis / S3) | Lo que Necesita Hacer el Frontend Visualmente (UI / UX / Librerías) |
| :--- | :--- | :--- |
| **1. Autenticación y Sesión** | • Emite JWT en cookies HttpOnly (`access_token` 15m, `refresh_token` 7d).<br>• Rotación estricta con detección de reúso en Redis.<br>• Throttling de 5 intentos por minuto.<br>• Invalidación instantánea en Redis al cerrar sesión (`blacklistToken`). | **• Pantalla de Login Split-Screen:** Mitad izquierda con fondo *Dot Grid* animado y gradiente, mitad derecha con formulario limpio.<br>**• Medidor de Fuerza:** Barra de 4 segmentos reactiva al escribir la contraseña (Rojo $\rightarrow$ Verde).<br>**• Switch "Recordar este equipo":** Dispositivo confiable por 30 días.<br>**• Manejo de Rate Limit:** Banner con contador de cuenta regresiva si el backend arroja 429.<br>**• Logout Transparente:** Fade-out con Framer Motion y limpieza de Zustand. |
| **2. Dominio 2FA / MFA Independiente** | • Endpoints en `/auth/2fa`: `generate`, `turn-on`, `turn-off`, `authenticate`.<br>• Cifrado AES-256-GCM de claves TOTP.<br>• Códigos de respaldo (backup codes) hasheados.<br>• Decorador `@Require2FA()` para Step-Up Auth. | **• Modal de Activación:** Bento card que renderiza el QR nítido con marco luminoso, botón "Copiar clave" con check animado.<br>**• Input de Código:** Componente `InputOTP` con 6 casillas separadas, auto-enfoque y cursor pulsante.<br>**• Cuadrícula de Backup Codes:** Grid de 2x4 casillas con botón *"Descargar códigos (.txt)"* y confirmación modal.<br>**• Diálogo Step-Up Auth:** Modal con fondo desenfocado (*backdrop-blur*) que se activa automáticamente al requerir cabecera `x-2fa-code`. |
| **3. Usuarios y Roles RBAC** | • Modelos Prisma: `User`, `Role`, `Permission`, `UserRole`, `RolePermission`.<br>• Guards `RolesGuard` y `PermissionsGuard`.<br>• Endpoint `GET /auth/users-export` para exportación autorizada.<br>• Endpoint `GET /auth/admin-dashboard` restringido a rol `admin`. | **• Directorio de Usuarios Virtualizado:** TanStack Table v8 + Virtual con scroll fluido a 60 FPS.<br>**• Filtros y Búsqueda:** Buscador reactivo con debounce y filtro desplegable por rol.<br>**• Badges de Roles:** Etiquetas estilizadas de color distintivo (`admin` morado, `user` azul).<br>**• Switch de Estado In-line:** Activa/suspende usuarios al instante con mutación optimista.<br>**• Asignación de Roles:** Modal con checkboxes para modificar roles y permisos del usuario. |
| **4. Acciones Críticas con Step-Up** | • Endpoint `POST /auth/critical-action` protegido por `@Require2FA()`.<br>• Exige la cabecera `x-2fa-code` validando el token TOTP dinámico. | **• Hook `useStepUpAuth()`:** Intercepta la petición y abre un modal flotante si la operación requiere elevación de privilegios.<br>**• Escudo Animado:** Modal con icono de candado con pulso dorado, casillas `InputOTP` y botón de confirmación. |
| **5. Archivos S3, Antivirus y WebP** | • Subida simple y múltiple en `/files/upload`.<br>• Conversión automática a WebP con Sharp.<br>• Escaneo en caliente con ClamAV.<br>• Rollback automático en S3 si falla Prisma. | **• Zona Dropzone:** Área de arrastre con borde punteado reactivo al cursor.<br>**• Proceso Visual de 3 Fases en Sonner:**<br>1️⃣ Subiendo archivo (barra de progreso 0% a 100%).<br>2️⃣ Escaneando contra virus con ClamAV (icono de radar girando).<br>3️⃣ Optimizado a WebP (-65% tamaño) y guardado en S3.<br>**• Alerta de Malware:** Modal crítico en rojo si el archivo es rechazado por antivirus. |
| **6. Auditoría y Trazabilidad** | • `AuditService` persistiendo `action`, `entity`, `ipAddress`, `userAgent` y `details` en JSON.<br>• Tarea programada en `TasksService` que depura logs antiguos (>90 días). | **• Tabla de Auditoría Filtrable:** Búsqueda por usuario, IP, acción (`LOGIN`, `UPLOAD_FILE`, `UPDATE_USER`), con selector de rango de fechas.<br>**• Visor de Diferencias JSON:** Al hacer clic en un evento, abre un modal con vista comparativa *Side-by-Side* (rojo = valor anterior, verde = valor nuevo).<br>**• Insignia de Dispositivo:** Muestra navegador e IP con icono de geolocalización. |
| **7. Observabilidad y Health Checks** | • Endpoint `GET /health` con NestJS Terminus.<br>• Pings a PostgreSQL, Redis y SeaweedFS. | **• Dashboard de Salud del Sistema:** 3 tarjetas interactivas tipo Bento con latencia en milisegundos (`3ms`), luces de pulso verde/rojo tipo servidor, y micro-gráfica de línea Sparkline con Recharts.<br>**• Conmutador de Auto-Refresh:** Reconsulta silenciosa cada 30s con TanStack Query. |
| **8. Feature Flags en Tiempo Real** | • Lectura rápida en Redis con fallback a PostgreSQL.<br>• Decorador `@RequireFeature()`. | **• Hook `useFeatureFlag()`:** Oculta o muestra secciones de la interfaz sin refrescar la pantalla.<br>**• Panel Administrativo:** Lista de funcionalidades con switches animados (`Switch`) e insignias de estado "En Producción" o "Beta". |

---

## 5. Wireframes y Experiencia Visual de Pantallas Clave

### A. Pantalla de Login & Verificación (Split-Screen SaaS)

```
+------------------------------------------+------------------------------------------+
|          BRANDING & ILUSTRACIÓN          |           FORMULARIO DE ACCESO           |
|                                          |                                          |
|   [ Logo Empresarial ]                   |   Iniciar Sesión                         |
|   Plataforma de Gestión Administrativa   |   Ingresa tus credenciales autorizadas   |
|                                          |                                          |
|   +----------------------------------+   |   Correo Electrónico                     |
|   |  Fondo animado Dot-Grid          |   |   [ usuario@empresa.com                ] |
|   |  Malla geométrica interactiva    |   |                                          |
|   |  Noticias y estado de seguridad  |   |   Contraseña                             |
|   +----------------------------------+   |   [ ****************                 ] (ojo) |
|                                          |   [=== Medidor de Seguridad: Óptima ===] |
|   "Control de acceso, auditoría          |                                          |
|    y archivos a máxima velocidad"        |   [X] Recordar este dispositivo por 30 d |
|                                          |   ¿Olvidaste tu contraseña?              |
|                                          |                                          |
|                                          |   +------------------------------------+ |
|                                          |   |   [ Iniciar Sesión ] (Shimmer)     | |
|                                          |   +------------------------------------+ |
|                                          |                                          |
|                                          |   (O) Conmutador Tema: [ Sol / Luna ]    |
+------------------------------------------+------------------------------------------+
```

---

### B. Módulo 2FA: Activación y Modal Step-Up Auth

```
    [ MODAL DE ACTIVACIÓN TOTP (Bento Card) ]          [ RETO STEP-UP AUTH (Acciones Críticas) ]
+-----------------------------------------------+   +-----------------------------------------------+
|  Configurar Doble Factor de Autenticación     |   |  Autorización Requerida (Step-Up 2FA)         |
|  Escanea el código con Google Auth o Authy    |   |  Esta acción requiere confirmación de firma   |
|                                               |   |                                               |
|       +-----------------------------+         |   |          [ Escudo de Seguridad ]              |
|       | [ CÓDIGO QR EN BASE64 ]     |         |   |            (Icono con pulso dorado)           |
|       |                             |         |   |                                               |
|       +-----------------------------+         |   |  Introduce tu código de 6 dígitos:            |
|  Clave manual: JBSWY3DPEHPK3PXP [Copiar]      |   |                                               |
|                                               |   |        [ 4 ] [ 8 ] [ 1 ] [ 9 ] [ 2 ] [ 0 ]    |
|  Código de verificación:                      |   |                                               |
|  [ 5 ] [ 9 ] [ 2 ] [ 1 ] [ 0 ] [ 4 ]          |   |  [ Cancelar ]            [ Autorizar Acción ] |
|                                               |   +-----------------------------------------------+
|  +-----------------------------------------+  |
|  | [ Activar y Generar Códigos de Respaldo]|  |
|  +-----------------------------------------+  |
+-----------------------------------------------+
```

---

### C. Directorio de Usuarios & Asignación de Roles RBAC (Desktop vs. Móvil)

#### 🖥️ Vista Escritorio: TanStack Table Virtualizada con Filtros y Switches
```
[ Buscar usuarios... (Q) ]  [ Filtro: Todos los Roles v ]  [ Estatus: Activos v ]    [ Exportar CSV ]
+------------+---------------------------+-------------------+----------------+-------------+---------+
| USUARIO    | CORREO ELECTRÓNICO        | ROLES ASIGNADOS   | PERMISOS BASE  | ESTADO      | ACCIÓN  |
+------------+---------------------------+-------------------+----------------+-------------+---------+
| [Avatar]   | admin@empresa.com         | [ Admin (Púrpura)]| files.*, users | [Switch: ON]| [Edit]  |
| [Avatar]   | carlos.s@empresa.com      | [ User (Azul)    ]| files.upload   | [Switch: ON]| [Edit]  |
| [Avatar]   | marta.l@empresa.com       | [ User (Azul)    ]| files.read     | [Switch:OFF]| [Edit]  |
| [Avatar]   | auditor@empresa.com       | [ Auditor (Gris) ]| audit.read     | [Switch: ON]| [Edit]  |
+------------+---------------------------+-------------------+----------------+-------------+---------+
  * El switch de estado ejecuta mutación optimista con useToggleUserStatusMutation().
  * Al hacer clic en [Edit] abre el diálogo modal para asignar o revocar roles RBAC.
```

#### 📱 Vista Móvil: Cards con Drawer Táctil Inferior (Vaul)
```
+---------------------------------------+      +---------------------------------------+
|  Directorio Usuarios       [Filtro]   |      |  ( Drawer táctil inferior desplegado )|
|                                       |      |                                       |
|  +---------------------------------+  |      |  Editar Roles: Carlos Silva           |
|  | CARLOS SILVA                    |  |      |  Email: carlos.s@empresa.com          |
|  | Rol: User  • Estado: Activo     |  |      |                                       |
|  | [ Administrar Roles y Permisos ]|  | ===> |  Roles asignados:                     |
|  +---------------------------------+  |      |  [X] Administrador                    |
|  | MARTA LÓPEZ                     |  |      |  [X] Usuario Estándar                 |
|  | Rol: User  • Estado: Suspendido |  |      |  [ ] Auditor de Sistema               |
|  +---------------------------------+  |      |                                       |
|                                       |      |  Permisos heredados:                  |
|  [==================================] |      |  files.upload, files.read             |
|  [Inicio]  [Usuarios]  [Archivos] [Audit]    |  [ Cancelar ]    [ Guardar Cambios ]  |
+---------------------------------------+      +---------------------------------------+
```

---

### D. Trazabilidad & Visor de Diferencias JSON (Side-by-Side Diff)

```
+---------------------------------------------------------------------------------------------+
|  REGISTRO DE AUDITORÍA Y SEGURIDAD                      [ Rango: Últimos 7 días v ] [Filtrar]|
+-----------------------------------+-----------------------------+---------------------------+
|  EVENTO: MODIFICACIÓN DE ROL      |  USUARIO AFECTADO: ID 402   |  RESPONSABLE: admin@empresa|
|  Fecha: 2026-09-10 14:32:05       |  IP: 192.168.1.45 (Chrome)  |  Endpoint: PATCH /users/402|
+-----------------------------------+-----------------------------+---------------------------+
|  VISOR DE DIFERENCIAS (JSON Side-by-Side Diff):                                             |
|  ESTADO ANTERIOR (-)                           |  ESTADO NUEVO (+)                          |
|  --------------------------------------------- | ------------------------------------------ |
|  {                                             |  {                                         |
|  -  "role": "user",                            |  +  "role": "admin",                       |
|  -  "permissions": ["files.read"],             |  +  "permissions": ["files.*", "users:*"], |
|     "isActive": true                           |     "isActive": true                        |
|  }                                             |  }                                         |
+---------------------------------------------------------------------------------------------+
```

---

### E. Gestor de Archivos, Carga S3 y Escaneo Antivirus ClamAV

```
+---------------------------------------------------------------------------------------------+
|  GESTOR DE ARCHIVOS Y DOCUMENTOS EMPRESARIALES                                              |
|                                                                                             |
|   + - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +   |
|   |                     [ Icono Upload con animación hover ]                            |   |
|   |           Arrastra tus comprobantes, contratos o reportes aquí                      |   |
|   |                 Formatos soportados: PDF, JPG, PNG (Hasta 5 MB)                     |   |
|   |                     [ Seleccionar archivos del equipo ]                             |   |
|   + - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +   |
|                                                                                             |
|  Archivos en proceso de carga:                                                              |
|  [PDF] Reporte_Financiero_Q3.pdf                                                            |
|        Fase: [== Escaneando con ClamAV Antivirus ==] (Radar pulsante)                       |
|                                                                                             |
|  [IMG] Foto_Perfil_Corporativo.png                                                          |
|        Fase: [== Optimizado a WebP (-68% peso) ==] -> Resguardado en SeaweedFS [ Ver URL ]  |
+---------------------------------------------------------------------------------------------+
```

---

### F. Tablero de Salud del Backend (Observabilidad en Vivo)

```
+---------------------------------------------------------------------------------------------+
|  ESTADO DE SALUD DEL SISTEMA (GET /health)              [ (o) Auto-refresh 30s ] [ Refrescar]|
+-------------------------------+-----------------------------+-------------------------------+
|  BASE DE DATOS (PostgreSQL)   |  CACHÉ & SESIONES (Redis)   |  ALMACENAMIENTO (SeaweedFS)   |
|                               |                             |                               |
|   ● OPERACIONAL               |   ● CONECTADO               |   ● BUCKET MONTADO            |
|   Latencia: 3 ms              |   Uptime: 99.98%            |   Disponibilidad: 100%        |
|   Motor: Prisma ORM           |   Lista Negra: 12 tokens    |   ClamAV Daemon: Activo       |
|   [~~~ Sparkline Recharts ~~~]|   [~~~ Sparkline Recharts ~~|   [~~~ Sparkline Recharts ~~~]|
+-------------------------------+-----------------------------+-------------------------------+
```

---

### G. Pantalla de Carga Inicial del Sistema (App Resource Preloader / Splash)

```
+---------------------------------------------------------------------------------------------+
|                                                                                             |
|                                   [ LOGO EMPRESARIAL ]                                      |
|                             (Efecto Shimmer / Resplandor Glow)                              |
|                                                                                             |
|                         PLATAFORMA SAAS EMPRESARIAL & ADMINISTRATIVA                        |
|                                                                                             |
|                            [======================............]                             |
|                             Barra de Progreso Indeterminada (shadcn)                        |
|                                                                                             |
|                         "Cargando recursos del sistema y sesión segura..."                  |
|                                                                                             |
+---------------------------------------------------------------------------------------------+
```

---

### H. Skeletons Adaptativos (Cero Pantallas en Blanco / Zero CLS)

#### Skeleton de Tabla de Usuarios y Roles RBAC
```
+---------------------------------------------------------------------------------------------+
| [Skeleton: Buscador de usuarios]       [Skeleton: Filtro Rol]         [Skeleton: Exportar]  |
+------------+---------------------------+-------------------+----------------+---------------+
| [Skeleton] | [Skeleton: Correo]        | [Skeleton: Badge] | [Skeleton: Sw] | [Skeleton: Btn|
| [Skeleton] | [Skeleton: Correo]        | [Skeleton: Badge] | [Skeleton: Sw] | [Skeleton: Btn|
| [Skeleton] | [Skeleton: Correo]        | [Skeleton: Badge] | [Skeleton: Sw] | [Skeleton: Btn|
| [Skeleton] | [Skeleton: Correo]        | [Skeleton: Badge] | [Skeleton: Sw] | [Skeleton: Btn|
| [Skeleton] | [Skeleton: Correo]        | [Skeleton: Badge] | [Skeleton: Sw] | [Skeleton: Btn|
+------------+---------------------------+-------------------+----------------+---------------+
```

---

## 6. Estrategia de Carga: Lazy Loading, App Preloader y Skeletons Adaptativos

Para garantizar que la web cargue a velocidad instantánea (FCP < 1s) y jamás experimente pantallas en blanco ni saltos bruscos de maquetación:

### A. Code-Splitting por Rutas con `React.lazy()` y `<Suspense>`
Cada módulo de negocio se descarga únicamente cuando el usuario navega a su ruta correspondiente:

```typescript
import { lazy, Suspense } from 'react';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { BentoGridSkeleton } from '@/components/shared/BentoGridSkeleton';

// Carga bajo demanda por módulo (Code-Splitting con import dinámico)
const UsersPage = lazy(() => import('@/features/users/components/UsersPage'));
const S3FilesPage = lazy(() => import('@/features/files/components/S3FilesPage'));
const AuditLogsPage = lazy(() => import('@/features/audit/components/AuditLogsPage'));
const TwoFactorSetupPage = lazy(() => import('@/features/two-factor/components/TwoFactorSetupPage'));
const HealthDashboardPage = lazy(() => import('@/features/health/components/HealthDashboardPage'));
const FeatureFlagsPage = lazy(() => import('@/features/feature-flags/components/FeatureFlagsPage'));

// Definición en el router con Suspense y su Skeleton específico
export const routes = [
  {
    path: '/usuarios',
    element: (
      <Suspense fallback={<TableSkeleton columns={6} rows={10} />}>
        <UsersPage />
      </Suspense>
    ),
  },
  {
    path: '/archivos',
    element: (
      <Suspense fallback={<TableSkeleton columns={5} rows={8} />}>
        <S3FilesPage />
      </Suspense>
    ),
  },
  {
    path: '/auditoria',
    element: (
      <Suspense fallback={<TableSkeleton columns={6} rows={10} />}>
        <AuditLogsPage />
      </Suspense>
    ),
  },
  {
    path: '/salud',
    element: (
      <Suspense fallback={<BentoGridSkeleton />}>
        <HealthDashboardPage />
      </Suspense>
    ),
  },
];
```

### B. Pantalla de Carga Inicial Branded (`components/shared/AppPreloader.tsx`)
Renderizada mientras React descarga los bundles principales de la web y la tienda de Zustand valida el token de sesión o refresca cookies (`/auth/refresh`):

```tsx
import { motion } from 'framer-motion';
import { Progress } from '@/components/ui/progress';
import { ShieldCheck } from 'lucide-react';

export const AppPreloader = () => {
  return (
    <div className="notranslate fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: [0.95, 1.05, 1], opacity: 1 }}
        transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
        className="relative flex items-center justify-center mb-6"
      >
        <div className="absolute -inset-4 rounded-full bg-primary/20 blur-xl" />
        <div className="relative rounded-2xl border bg-card p-5 shadow-2xl">
          <ShieldCheck className="h-12 w-12 text-primary animate-pulse" />
        </div>
      </motion.div>

      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        <span>Plataforma SaaS Empresarial</span>
      </h2>
      <p className="text-xs text-muted-foreground mt-1 mb-6">
        <span>Cargando recursos del sistema y verificando sesión segura...</span>
      </p>

      <div className="w-56 overflow-hidden rounded-full">
        <Progress value={undefined} className="h-1.5 w-full" />
      </div>
    </div>
  );
};
```

### C. Componente Skeleton para Tablas Virtualizadas (`components/shared/TableSkeleton.tsx`)
Replica con precisión milimétrica la geometría de la tabla tipo Excel para evitar parpadeos visuales:

```tsx
import { Skeleton } from '@/components/ui/skeleton';

export const TableSkeleton = ({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) => {
  return (
    <div className="w-full space-y-4 p-6">
      {/* Barra superior de controles */}
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-10 w-72 rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>

      {/* Cabecera y filas pulsantes */}
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        <div className="flex border-b bg-muted/40 p-3 gap-4">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-5 flex-1" />
          ))}
        </div>
        <div className="divide-y divide-border/30">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div key={rowIndex} className="flex items-center p-3.5 gap-4">
              {Array.from({ length: columns }).map((_, colIndex) => (
                <Skeleton
                  key={colIndex}
                  className={`h-6 flex-1 ${colIndex === 1 ? 'w-48' : 'w-full'}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
```

---

## 7. Estado Global Persistente con Zustand (Sin Pérdida de Datos)

Para que los datos del usuario, el tema visual o las preferencias no se pierdan al presionar `F5`:

### A. Store de Autenticación (`stores/use-auth-store.ts`)
```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UserAuthContext } from '@/types';

interface AuthState {
  user: UserAuthContext | null;
  isAuthenticated: boolean;
  accessToken: string | null;

  setAuth: (user: UserAuthContext, token?: string) => void;
  updateUser: (partial: Partial<UserAuthContext>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      accessToken: null,

      setAuth: (user, token) =>
        set({
          user,
          isAuthenticated: true,
          accessToken: token || null,
        }),

      updateUser: (partial) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...partial } : null,
        })),

      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          accessToken: null,
        }),
    }),
    {
      name: 'sistema-saas-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        accessToken: state.accessToken,
      }),
    },
  ),
);
```

### B. Store de Preferencias y UI (`stores/use-ui-store.ts`)
```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface UIState {
  theme: 'light' | 'dark' | 'system';
  isSidebarCollapsed: boolean;
  usersViewMode: 'table' | 'cards';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleSidebar: () => void;
  setUsersViewMode: (mode: 'table' | 'cards') => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'system',
      isSidebarCollapsed: false,
      usersViewMode: 'table',

      setTheme: (theme) => set({ theme }),
      toggleSidebar: () =>
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
      setUsersViewMode: (usersViewMode) => set({ usersViewMode }),
    }),
    {
      name: 'sistema-saas-ui',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
```

---

## 8. Capa de Red HTTP con Idempotencia y Renovación Silenciosa (`api/client.ts`)

El backend de NestJS exige envío de cookies seguras, cabecera de idempotencia en mutaciones y devuelve errores con el formato uniforme de [`HttpExceptionFilter`](file:///c:/Users/mayka/OneDrive/Desktop/sistema/src/common/filters/http-exception.filter.ts).

```typescript
import axios from 'axios';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/use-auth-store';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  withCredentials: true, // Envía cookies HttpOnly en cada petición
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor de Petición: Inyección de Idempotency-Key y Bearer fallback
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Previene duplicidad en operaciones críticas o subida de archivos
  const method = config.method?.toUpperCase();
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    if (!config.headers['Idempotency-Key']) {
      config.headers['Idempotency-Key'] = crypto.randomUUID();
    }
  }

  return config;
});

// Interceptor de Respuesta: Renovación silenciosa y toasts uniformes
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve();
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Renovación transparente en 401
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => apiClient(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshResponse = await apiClient.post('/auth/refresh');
        const { accessToken, user } = refreshResponse.data;
        useAuthStore.getState().setAuth(user, accessToken);
        processQueue(null);
        return apiClient(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr as Error);
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    // Captura uniforme del mensaje de error del backend
    const backendMessage = error.response?.data?.message;
    if (backendMessage && !originalRequest.suppressToast) {
      const displayMsg = Array.isArray(backendMessage)
        ? backendMessage.join(', ')
        : backendMessage;
      toast.error(displayMsg);
    }

    return Promise.reject(error);
  },
);
```

---

## 9. Módulos y Funcionalidades del Sistema

### A. Módulo de Autenticación (`features/auth/`)
- `POST /auth/login`: Formulario con medidor de fuerza de contraseña y opción *"Recordar dispositivo por 30 días"*. Si el backend responde `{ require2FA: true, tempToken }`, delega el flujo a la pantalla de reto 2FA.
- `POST /auth/register`: Registro institucional con validación Zod.
- `GET /auth/verify-email?token=...`: Pantalla de bienvenida que verifica el token y ofrece reenvío en caso de expiración.
- `POST /auth/logout`: Cierra sesión, purga el JWT de Redis y limpia el almacenamiento en Zustand.

---

### B. Módulo Independiente de 2FA / MFA (`features/two-factor/`)
El backend gestiona la autenticación en dos pasos en el controlador `/auth/2fa`:
- **Generación de QR (`POST /auth/2fa/generate`):** Muestra el código QR (`qrCodeDataUrl`) y la clave Base32 con botón de copiado rápido en el perfil del usuario.
- **Activación (`POST /auth/2fa/turn-on`):** Input de 6 dígitos con `InputOTP` de shadcn para validar y persistir en la tabla dedicada `user_two_factors`.
- **Desactivación (`POST /auth/2fa/turn-off`):** Confirmación modal con código actual.
- **Autenticación en Login (`POST /auth/2fa/authenticate`):** Valida el `tempToken` con el código OTP y emite las cookies seguras.
- **Step-Up Authentication para Acciones Críticas:**  
  Endpoints protegidos por `@Require2FA()` (ej. eliminación masiva de registros, exportación confidencial de usuarios o cambios estructurales de roles) exigen la cabecera `x-2fa-code`. Se debe implementar el hook `useStepUpAuth()` para abrir automáticamente un diálogo modal solicitando el código antes de reintentar la operación.

---

### C. Módulo de Gestión de Usuarios y Control de Acceso RBAC (`features/users/`)
- Conectado a los modelos de Prisma `User`, `Role`, `Permission`, `UserRole` y `RolePermission`:
  - `GET /auth/admin-dashboard`: Vista de administración general restringida a rol `admin`.
  - `GET /auth/users-export`: Exportación masiva de datos autorizada mediante permiso `users:export`.
  - Directorio virtualizado de usuarios con `TanStack Table v8` + `TanStack Virtual`:
    - Buscador en tiempo real con debounce y filtrado por rol y estado activo/suspendido.
    - Switch in-line para activar/suspender usuarios con mutación optimista inmediata.
    - Diálogo modal para asignación y revocación de roles y permisos granulares.

---

### D. Módulo de Archivos y Almacenamiento S3 / SeaweedFS (`features/files/`)
- Conectado a SeaweedFS / S3 con escaneo antivirus ClamAV en caliente y optimización WebP:
  - `POST /files/upload`: Subida simple (máx 5 MB) con compresión automática a WebP y escaneo ClamAV.
  - `POST /files/upload-multiple`: Subida múltiple (hasta 10 archivos de máx 5 MB c/u).
  - `GET /files/public/:key`: Consulta pública de archivos sin requerir cabeceras de autenticación.
  - `GET /files/view/:key` y `GET /files/:key/url`: Consulta y visualización privada protegida por permiso `files.read`.
  - `DELETE /files/:key`: Eliminación de archivos protegida por permiso `files.delete` o rol `admin`.
  - **Manejo de Alertas Antivirus:** Si el backend arroja `400 Bad Request` por detección de malware, Sonner muestra toast crítico: *"Archivo rechazado: amenaza de virus detectada por ClamAV"*.

---

### E. Módulo de Auditoría y Trazabilidad (`features/audit/`)
- Rastreo centralizado de todas las operaciones realizadas en el sistema (`AuditLog`):
  - Tabla TanStack con timestamp, avatar del usuario responsable, acción ejecutada (`LOGIN`, `UPLOAD_FILE`, `UPDATE_USER`, `DELETE_FILE`), IP y navegador.
  - Al hacer clic en una fila, abre un modal con el **Visor de Diferencias JSON (Side-by-Side Diff Viewer)** comparando los valores antes y después de la operación.

---

### F. Módulo de Observabilidad (`features/health/`)
- Monitoreo en vivo de la infraestructura (`GET /health`):
  - Tarjetas de estado con latencia de PostgreSQL (Prisma), caché de Redis y disponibilidad de SeaweedFS/S3.
  - Consulta automática cada 30 segundos con TanStack Query.

---

### G. Módulo de Feature Flags (`features/feature-flags/`)
- Consumo reactivo en componentes con el hook `useFeatureFlag('BETA_FEATURE')`.
- Panel de administración para habilitar/deshabilitar funcionalidades y configurar despliegues progresivos (*rollout* porcentual) sin necesidad de reiniciar el backend.

---


## 10. Catálogo Exhaustivo de Endpoints, DTOs y Contratos de Respuesta (API Contract Reference)

> [!IMPORTANT]
> Esta sección documenta **el 100% de los controladores y endpoints expuestos por el backend de NestJS**.  
> Cada especificación incluye: método HTTP, ruta exacta, nivel de acceso/guardias, rate limits (Throttler), cabeceras y cookies obligatorias, contrato TypeScript de entrada (Request DTO), contrato TypeScript de salida (Response), ejemplos de JSON y la función `action` correspondiente para la capa de red del frontend.

---

### A. Dominio de Autenticación y Sesión (`/auth`)

#### 1. Registro de Usuario (`POST /auth/register`)
- **Acceso:** Público
- **Rate Limit:** Máximo 5 peticiones por minuto (`@Throttle({ limit: 5, ttl: 60000 })`).
- **Headers:** `Content-Type: application/json`, `Idempotency-Key` (UUIDv4 opcional).
- **Descripción:** Crea un nuevo usuario en PostgreSQL, valida la robustez de la contraseña (mínimo 8 caracteres, al menos 1 mayúscula, 1 minúscula, 1 número y 1 símbolo especial), le asigna por defecto el rol `user`, y despacha un correo con el token criptográfico de verificación.

**Contratos TypeScript:**
```typescript
export interface RegisterDto {
  email: string;     // Email válido y único
  password: string;  // Cumple política estricta de contraseñas
  name?: string;     // Nombre completo opcional
}

export interface RegisterResponse {
  message: string;   // "Usuario registrado exitosamente. Por favor verifica tu correo electrónico."
  user: {
    id: string;      // UUIDv4
    email: string;
    name: string | null;
    createdAt: string; // ISO 8601 string
  };
}
```

**Ejemplo de Respuesta (201 Created):**
```json
{
  "message": "Usuario registrado exitosamente. Por favor verifica tu correo electrónico.",
  "user": {
    "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "email": "carlos.silva@empresa.com",
    "name": "Carlos Silva",
    "createdAt": "2026-09-10T14:30:00.000Z"
  }
}
```

**Errores Posibles:**
- `400 Bad Request`: `"El usuario ya se encuentra registrado"` o mensaje de contraseña débil.
- `429 Too Many Requests`: Superó los 5 intentos en 60 segundos.

**Acción Frontend (`features/auth/actions/auth.actions.ts`):**
```typescript
export const registerAction = async (dto: RegisterDto): Promise<RegisterResponse> => {
  const response = await apiClient.post<RegisterResponse>('/auth/register', dto);
  return response.data;
};
```

---

#### 2. Verificación de Correo Electrónico (`GET /auth/verify-email`)
- **Acceso:** Público
- **Rate Limit:** Máximo 10 peticiones por minuto.
- **Query Params:** `?token=<string>`
- **Descripción:** Valida el token recibido por email y actualiza la columna `email_verified_at` del usuario.

**Contratos TypeScript:**
```typescript
export interface VerifyEmailQueryDto {
  token: string;
}

export interface VerifyEmailResponse {
  message: string; // "Correo electrónico verificado exitosamente. Ya puedes iniciar sesión."
}
```

**Ejemplo de Respuesta (200 OK):**
```json
{
  "message": "Correo electrónico verificado exitosamente. Ya puedes iniciar sesión."
}
```

**Errores Posibles:**
- `400 Bad Request`: `"Token de verificación inválido o expirado"`.

**Acción Frontend:**
```typescript
export const verifyEmailAction = async (token: string): Promise<VerifyEmailResponse> => {
  const response = await apiClient.get<VerifyEmailResponse>('/auth/verify-email', {
    params: { token },
  });
  return response.data;
};
```

---

#### 3. Reenvío de Token de Verificación (`POST /auth/resend-verification`)
- **Acceso:** Público
- **Rate Limit:** Máximo 2 peticiones por minuto.
- **Headers:** `Content-Type: application/json`

**Contratos TypeScript:**
```typescript
export interface ResendVerificationDto {
  email: string;
}

export interface ResendVerificationResponse {
  message: string; // "Si el correo está registrado y pendiente de verificación, recibirás un nuevo enlace."
}
```

**Ejemplo de Respuesta (200 OK):**
```json
{
  "message": "Si el correo está registrado y pendiente de verificación, recibirás un nuevo enlace."
}
```

**Acción Frontend:**
```typescript
export const resendVerificationAction = async (dto: ResendVerificationDto): Promise<ResendVerificationResponse> => {
  const response = await apiClient.post<ResendVerificationResponse>('/auth/resend-verification', dto);
  return response.data;
};
```

---

#### 4. Inicio de Sesión (`POST /auth/login`)
- **Acceso:** Público
- **Rate Limit:** Máximo 5 peticiones por minuto (`@Throttle({ limit: 5, ttl: 60000 })`).
- **Headers:** `Content-Type: application/json`
- **Cookies Leídas:** `trusted_device` (opcional, enviada automáticamente si el dispositivo ya fue verificado previamente).
- **Descripción:** Valida credenciales protegiendo contra *timing attacks*. Si el usuario **tiene 2FA habilitado** y no presenta un `trusted_device` válido, el backend responde con un reto `require2FA: true` y un `tempToken`. Si **no tiene 2FA** o su equipo es de confianza, emite la sesión de inmediato y adjunta las cookies HttpOnly.

**Contratos TypeScript:**
```typescript
export interface LoginDto {
  email: string;
  password: string;
  trustDevice?: boolean; // Solicitar recordar el dispositivo por 30 días
}

export interface LoginSuccessResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    roles: string[];
    permissions: string[];
  };
}

export interface LoginTwoFactorRequiredResponse {
  require2FA: true;
  tempToken: string; // Token hexadecimal temporal (64 caracteres) con TTL de 300s en Redis
}

export type LoginResponse = LoginSuccessResponse | LoginTwoFactorRequiredResponse;
```

**Cookies Fijadas en la Respuesta (en Login Exitoso):**
- `access_token`: JWT con TTL de 15 minutos (`HttpOnly`, `SameSite: Lax`, `Secure` en producción).
- `refresh_token`: JWT con TTL de 7 días (`HttpOnly`, `SameSite: Lax`, `Secure`).
- `trusted_device`: UUIDv4 con TTL de 30 días (solo si `trustDevice === true`).

**Ejemplo de Respuesta 1: Reto 2FA Requerido (200 OK):**
```json
{
  "require2FA": true,
  "tempToken": "f7a3b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7"
}
```

**Ejemplo de Respuesta 2: Acceso Directo Concedido (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "email": "carlos.silva@empresa.com",
    "roles": ["user"],
    "permissions": ["files.read", "files.upload"]
  }
}
```

**Errores Posibles:**
- `401 Unauthorized`: `"Credenciales inválidas"`, `"Usuario inactivo o dado de baja"`, o `"Debes confirmar tu correo electrónico antes de iniciar sesión"`.

**Acción Frontend:**
```typescript
export const loginAction = async (dto: LoginDto): Promise<LoginResponse> => {
  const response = await apiClient.post<LoginResponse>('/auth/login', dto);
  return response.data;
};
```

---

#### 5. Renovación Transparente de Sesión (`POST /auth/refresh`)
- **Acceso:** Mediante cookie HttpOnly `refresh_token`.
- **Headers:** No requiere `Authorization` manual (`apiClient` envía la cookie con `withCredentials: true`).
- **Body:** Vacío `{}`.
- **Descripción:** Valida la firma del `refresh_token`, realiza **rotación criptográfica** del token en Redis generando un nuevo `tokenId`. Si detecta un intento de reúso de un token anterior, **revoca inmediatamente todas las sesiones activas del usuario**.

**Contratos TypeScript:**
```typescript
export interface RefreshTokenResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    roles: string[];
    permissions: string[];
  };
}
```

**Ejemplo de Respuesta (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "email": "carlos.silva@empresa.com",
    "roles": ["user"],
    "permissions": ["files.read", "files.upload"]
  }
}
```

**Errores Posibles:**
- `401 Unauthorized`: `"Refresh token ausente"`, `"Token inválido o expirado"`, o `"Reúso detectado. Sesiones invalidadas."`.

**Acción Frontend:**
```typescript
export const refreshTokenAction = async (): Promise<RefreshTokenResponse> => {
  const response = await apiClient.post<RefreshTokenResponse>('/auth/refresh');
  return response.data;
};
```

---

#### 6. Cierre de Sesión (`POST /auth/logout`)
- **Acceso:** Autenticado (`JwtAuthGuard`).
- **Headers:** `Authorization: Bearer <token>` o cookie `access_token`.
- **Cookies Leídas:** `refresh_token`.
- **Descripción:** Revoca la sesión en Redis, incluye el `jti` y la firma del JWT de acceso en la lista negra (`blacklistToken`) durante su tiempo de vida restante, y borra las cookies `access_token` y `refresh_token` del navegador.

**Contratos TypeScript:**
```typescript
export interface LogoutResponse {
  message: string; // "Sesión cerrada exitosamente"
}
```

**Ejemplo de Respuesta (200 OK):**
```json
{
  "message": "Sesión cerrada exitosamente"
}
```

**Acción Frontend:**
```typescript
export const logoutAction = async (): Promise<LogoutResponse> => {
  const response = await apiClient.post<LogoutResponse>('/auth/logout');
  return response.data;
};
```

---

#### 7. Dashboard Administrativo (`GET /auth/admin-dashboard`)
- **Acceso:** Restringido a rol `admin` (`JwtAuthGuard`, `PermissionsGuard`, `@Roles('admin')`).
- **Headers:** `Authorization: Bearer <token>`.

**Contratos TypeScript:**
```typescript
export interface AdminDashboardResponse {
  message: string; // "Acceso autorizado como administrador"
  user: {
    id: string;
    email: string;
    roles: string[];
    permissions: string[];
    isTwoFactorEnabled?: boolean;
  };
}
```

**Ejemplo de Respuesta (200 OK):**
```json
{
  "message": "Acceso autorizado como administrador",
  "user": {
    "id": "f1e2d3c4-b5a6-7890-1234-56789abcdef0",
    "email": "admin@empresa.com",
    "roles": ["admin"],
    "permissions": ["*"],
    "isTwoFactorEnabled": true
  }
}
```

**Errores Posibles:**
- `403 Forbidden`: Si el usuario autenticado no posee el rol `admin`.

---

#### 8. Exportación Masiva de Usuarios (`GET /auth/users-export`)
- **Acceso:** Restringido por permiso (`JwtAuthGuard`, `PermissionsGuard`, `@RequirePermissions('users:export')`).
- **Headers:** `Authorization: Bearer <token>`.

**Contratos TypeScript:**
```typescript
export interface UsersExportResponse {
  message: string; // "Permiso users:export validado"
  user: {
    id: string;
    email: string;
    roles: string[];
    permissions: string[];
    isTwoFactorEnabled?: boolean;
  };
}
```

**Ejemplo de Respuesta (200 OK):**
```json
{
  "message": "Permiso users:export validado",
  "user": {
    "id": "f1e2d3c4-b5a6-7890-1234-56789abcdef0",
    "email": "admin@empresa.com",
    "roles": ["admin"],
    "permissions": ["users:export", "users:read", "users:write"]
  }
}
```

---

#### 9. Ejecución de Acción Crítica con Step-Up 2FA (`POST /auth/critical-action`)
- **Acceso:** Autenticado + Step-Up Auth (`JwtAuthGuard`, `TwoFactorGuard`, `@Require2FA()`).
- **Rate Limit:** Máximo 5 peticiones por minuto.
- **Headers Requeridos:**  
  - `Authorization: Bearer <token>`
  - `x-2fa-code: <string>` (Código TOTP de 6 dígitos numéricos o código de respaldo).
- **Descripción:** Endpoint protegido para operaciones de máximo riesgo (eliminaciones masivas, transferencias o alteraciones sensibles). Requiere confirmación de identidad en caliente.

**Contratos TypeScript:**
```typescript
export interface CriticalActionResponse {
  message: string; // "Acción crítica ejecutada exitosamente bajo validación Step-Up 2FA."
  user: {
    id: string;
    email: string;
    roles: string[];
    permissions: string[];
    isTwoFactorEnabled?: boolean;
  };
}
```

**Ejemplo de Respuesta (200 OK):**
```json
{
  "message": "Acción crítica ejecutada exitosamente bajo validación Step-Up 2FA.",
  "user": {
    "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "email": "carlos.silva@empresa.com",
    "roles": ["admin"],
    "permissions": ["users:*", "system:purge"]
  }
}
```

**Errores Posibles:**
- `401 Unauthorized`: Si falta la cabecera `x-2fa-code` o si el código TOTP ingresado es incorrecto/expirado.

**Acción Frontend:**
```typescript
export const executeCriticalAction = async (totpCode: string): Promise<CriticalActionResponse> => {
  const response = await apiClient.post<CriticalActionResponse>(
    '/auth/critical-action',
    {},
    {
      headers: {
        'x-2fa-code': totpCode,
      },
    }
  );
  return response.data;
};
```

---

### B. Dominio Independiente de Autenticación en Dos Pasos (`/auth/2fa`)

#### 1. Generación de Secreto y Código QR (`POST /auth/2fa/generate`)
- **Acceso:** Autenticado (`AuthGuard('jwt')`).
- **Headers:** `Authorization: Bearer <token>`.
- **Descripción:** Crea un secreto TOTP temporal en Redis con expiración de 10 minutos (600s), construye la URI estándar `otpauth://` y genera la imagen del código QR en formato Base64 Data URL para ser renderizada en una etiqueta `<img>`.

**Contratos TypeScript:**
```typescript
export interface TwoFactorGenerateResponse {
  otpauthUrl: string;   // "otpauth://totp/Sistema:usuario@empresa.com?secret=JBSWY3DPEHPK3PXP&issuer=Sistema"
  qrCodeDataUrl: string;// "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACt..."
}
```

**Ejemplo de Respuesta (200 OK):**
```json
{
  "otpauthUrl": "otpauth://totp/Sistema:carlos.silva@empresa.com?secret=JBSWY3DPEHPK3PXP&issuer=Sistema",
  "qrCodeDataUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAAAC20lEQVR4..."
}
```

**Acción Frontend (`features/two-factor/actions/two-factor.actions.ts`):**
```typescript
export const generateTwoFactorSecretAction = async (): Promise<TwoFactorGenerateResponse> => {
  const response = await apiClient.post<TwoFactorGenerateResponse>('/auth/2fa/generate');
  return response.data;
};
```

---

#### 2. Activación de 2FA (`POST /auth/2fa/turn-on`)
- **Acceso:** Autenticado (`AuthGuard('jwt')`).
- **Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`.
- **Descripción:** Recibe el código de 6 dígitos introducido por el usuario para verificar que sincronizó su app autenticadora. Valida contra el secreto temporal en Redis, cifra el secreto con AES-256-GCM y lo almacena permanentemente en `user_two_factors` con `isEnabled: true`.

**Contratos TypeScript:**
```typescript
export interface TwoFactorCodeDto {
  code: string; // Exactamente 6 dígitos numéricos: /^[0-9]{6}$/
}

export interface TwoFactorTurnOnResponse {
  message: string; // "Autenticación en dos pasos habilitada exitosamente."
}
```

**Ejemplo de Respuesta (200 OK):**
```json
{
  "message": "Autenticación en dos pasos habilitada exitosamente."
}
```

**Errores Posibles:**
- `400 Bad Request`: `"Código 2FA inválido."` o `"No hay una solicitud de configuración 2FA activa o ha expirado."`.

**Acción Frontend:**
```typescript
export const turnOnTwoFactorAction = async (dto: TwoFactorCodeDto): Promise<TwoFactorTurnOnResponse> => {
  const response = await apiClient.post<TwoFactorTurnOnResponse>('/auth/2fa/turn-on', dto);
  return response.data;
};
```

---

#### 3. Desactivación de 2FA (`POST /auth/2fa/turn-off`)
- **Acceso:** Autenticado (`AuthGuard('jwt')`).
- **Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`.
- **Descripción:** Requiere un código TOTP válido actual como confirmación antes de cambiar `isEnabled` a `false` en la base de datos.

**Contratos TypeScript:**
```typescript
export interface Toggle2FADto {
  code: string; // Exactamente 6 dígitos numéricos
}

export interface TwoFactorTurnOffResponse {
  message: string; // "Autenticación en dos pasos deshabilitada exitosamente."
}
```

**Ejemplo de Respuesta (200 OK):**
```json
{
  "message": "Autenticación en dos pasos deshabilitada exitosamente."
}
```

**Errores Posibles:**
- `400 Bad Request`: `"Código 2FA inválido."` o `"La autenticación en dos pasos no está habilitada para esta cuenta."`.

**Acción Frontend:**
```typescript
export const turnOffTwoFactorAction = async (dto: Toggle2FADto): Promise<TwoFactorTurnOffResponse> => {
  const response = await apiClient.post<TwoFactorTurnOffResponse>('/auth/2fa/turn-off', dto);
  return response.data;
};
```

---

#### 4. Validación de Reto 2FA en Inicio de Sesión (`POST /auth/2fa/authenticate`)
- **Acceso:** Público (Segundo paso del flujo de Login).
- **Rate Limit:** Máximo 5 peticiones por minuto (`@Throttle({ limit: 5, ttl: 60000 })`).
- **Headers:** `Content-Type: application/json`.
- **Descripción:** Valida el `tempToken` (obtenido tras el primer paso en `/auth/login`) y el código TOTP ingresado. Si es correcto, emite las cookies seguras (`access_token`, `refresh_token`, y opcionalmente `trusted_device` por 30 días si se marcó la casilla de recordar equipo).

**Contratos TypeScript:**
```typescript
export interface TwoFactorAuthDto {
  tempToken: string; // Token emitido en POST /auth/login
  code: string;      // Código TOTP de 6 dígitos
}

export interface TwoFactorAuthenticateResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    roles: string[];
    permissions: string[];
  };
}
```

**Ejemplo de Respuesta (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "email": "carlos.silva@empresa.com",
    "roles": ["user"],
    "permissions": ["files.read", "files.upload"]
  }
}
```

**Errores Posibles:**
- `400 Bad Request`: `"Código de dos factores inválido."` o `"El desafío 2FA ha expirado o no existe."`.

**Acción Frontend:**
```typescript
export const authenticateTwoFactorAction = async (
  dto: TwoFactorAuthDto
): Promise<TwoFactorAuthenticateResponse> => {
  const response = await apiClient.post<TwoFactorAuthenticateResponse>('/auth/2fa/authenticate', dto);
  return response.data;
};
```

---

### C. Dominio de Archivos y Almacenamiento S3 / SeaweedFS (`/files`)

> [!IMPORTANT]
> **Arquitectura de Persistencia y Entrega 100% Relativa:**  
> Queda estrictamente prohibido guardar URLs absolutas, IPs o puertos de SeaweedFS en la base de datos PostgreSQL.  
> Los DTOs de respuesta devuelven exclusivamente claves relativas (`key`) y rutas relativas de endpoint (`/api/files/view/${key}`).  
> El cliente frontend construye dinámicamente las URLs de visualización con el helper `getFileViewUrl(file.key)` (`src/utils/file-url.ts`).

#### 1. Subida Simple con Optimización y Antivirus (`POST /files/upload`)
- **Acceso:** Protegido (`JwtAuthGuard`, `RolesGuard`, `PermissionsGuard`, `@RequirePermissions('files.upload')`, `@Roles('admin', 'user')`).
- **Rate Limit:** Máximo 20 peticiones por minuto.
- **Headers:** `Authorization: Bearer <token>`, `Content-Type: multipart/form-data`, `Idempotency-Key` (UUIDv4).
- **Multipart Form Data:**
  - `file`: Archivo binario (Obligatorio, máx 5 MB / 5,242,880 bytes).
  - `customName`: `string` (Opcional, nombre base personalizado).
  - `bucket`: `string` (Opcional, nombre de bucket en S3).
- **Proceso Interno en Backend:**
  1. Validación de tamaño (máx 5 MB).
  2. Si es imagen (JPEG, PNG), la comprime y convierte automáticamente a **WebP con Sharp** (~65% reducción de peso).
  3. Ejecuta **escaneo de antivirus en caliente con ClamAV Daemon**. Si detecta una amenaza, rechaza el archivo con `400 Bad Request` y no guarda nada en S3.
  4. Sube a SeaweedFS/S3 con `PutObjectCommand`.
  5. Retorna el DTO `FileResponseDto` con la ruta relativa del endpoint (`url: "/api/files/view/${key}"`).

**Contratos TypeScript:**
```typescript
export interface FileResponseDto {
  key: string;          // Nombre único del archivo en S3 (ej. "1725973200000-contrato_anual.webp")
  filename: string;     // Nombre de archivo asignado o nombre original
  originalName: string; // Nombre original subido por el usuario
  bucket: string;       // Bucket de resguardo (ej. "sistema-files")
  url: string;          // Ruta relativa del endpoint: "/api/files/view/${key}"
  size: number;         // Tamaño procesado final en bytes
  mimetype: string;     // MIME type final (ej. "image/webp", "application/pdf")
}

export type UploadResult = FileResponseDto;
```

**Ejemplo de Respuesta (201 Created):**
```json
{
  "key": "1725973200000-contrato_anual.webp",
  "filename": "contrato_anual.png",
  "originalName": "contrato_anual.png",
  "bucket": "sistema-files",
  "url": "/api/files/view/1725973200000-contrato_anual.webp",
  "size": 245120,
  "mimetype": "image/webp"
}
```

**Errores Posibles:**
- `400 Bad Request`: `"El campo \"file\" es obligatorio"`, `"El archivo excede el tamaño máximo de 5MB"`, o `"Archivo rechazado: amenaza de virus detectada por ClamAV"`.
- `401 Unauthorized` / `403 Forbidden` (Falta permiso `files.upload`).

**Acción Frontend (`features/files/actions/files.actions.ts`):**
```typescript
import type { AxiosProgressEvent } from 'axios';

export interface UploadFileParams {
  file: File;
  customName?: string;
  bucket?: string;
  onProgress?: (percentage: number) => void;
}

export const uploadFileAction = async ({
  file,
  customName,
  bucket,
  onProgress,
}: UploadFileParams): Promise<FileResponseDto> => {
  const formData = new FormData();
  formData.append('file', file);
  if (customName) formData.append('customName', customName);
  if (bucket) formData.append('bucket', bucket);

  const response = await apiClient.post<FileResponseDto>('/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e: AxiosProgressEvent) => {
      if (e.total && onProgress) {
        const percent = Math.round((e.loaded * 100) / e.total);
        onProgress(percent);
      }
    },
  });

  return response.data;
};
```

---

#### 2. Subida Múltiple por Lote (`POST /files/upload-multiple`)
- **Acceso:** Protegido (`JwtAuthGuard`, `RolesGuard`, `PermissionsGuard`, `@RequirePermissions('files.upload')`, `@Roles('admin', 'user')`).
- **Rate Limit:** Máximo 10 peticiones por minuto.
- **Headers:** `Authorization: Bearer <token>`, `Content-Type: multipart/form-data`.
- **Multipart Form Data:**
  - `files`: Arreglo de hasta 10 archivos binarios (máx 5 MB cada uno).
  - `customName`: `string` (Opcional).
  - `bucket`: `string` (Opcional).

**Contratos TypeScript:**
```typescript
export type UploadMultipleResult = FileResponseDto[];
```

**Ejemplo de Respuesta (201 Created):**
```json
[
  {
    "key": "1725973200001-anexo1.webp",
    "filename": "anexo1.jpg",
    "originalName": "anexo1.jpg",
    "bucket": "sistema-files",
    "url": "/api/files/view/1725973200001-anexo1.webp",
    "size": 180400,
    "mimetype": "image/webp"
  },
  {
    "key": "1725973200002-anexo2.pdf",
    "filename": "anexo2.pdf",
    "originalName": "anexo2.pdf",
    "bucket": "sistema-files",
    "url": "/api/files/view/1725973200002-anexo2.pdf",
    "size": 890200,
    "mimetype": "application/pdf"
  }
]
```

**Acción Frontend:**
```typescript
export const uploadMultipleFilesAction = async (
  files: File[],
  customName?: string,
  bucket?: string
): Promise<FileResponseDto[]> => {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  if (customName) formData.append('customName', customName);
  if (bucket) formData.append('bucket', bucket);

  const response = await apiClient.post<FileResponseDto[]>('/files/upload-multiple', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return response.data;
};
```

---

#### 3. Consulta de URL Pública (`GET /files/public/:key`)
- **Acceso:** Público (`@Public()`). No requiere Bearer token.
- **Ruta:** `/files/public/:key` (resolviendo en `/api/files/public/:key`).
- **Query Params:** `?bucket=...` (opcional).
- **Comportamiento:** Lee el archivo desde SeaweedFS/S3 mediante `GetObjectCommand` y lo transmite directamente con `stream.pipe(res)` aplicando las cabeceras `Content-Type: ${contentType}` y `Content-Disposition: inline; filename="${key}"`.

---

#### 4. Streaming Seguro de Archivos Privados (`GET /files/view/:key`)
- **Acceso:** Protegido (`@RequirePermissions('files.read')`, `@Roles('admin', 'user')`).
- **Ruta:** `/files/view/:key` (resolviendo en `/api/files/view/:key`).
- **Headers:** `Authorization: Bearer <token>`.
- **Query Params:** `?bucket=...` (opcional).
- **Comportamiento:**
  1. Conexión segura con SeaweedFS con `GetObjectCommand`.
  2. Transmisión del flujo binario en chunks con `stream.pipe(res)`.
  3. Cabeceras HTTP:
     - `Content-Type: ${contentType}` (ej. `image/webp`, `application/pdf`)
     - `Content-Disposition: inline; filename="${key}"`

---

#### 5. Helper de Construcción Dinámica en Frontend (`src/utils/file-url.ts`)
Para evitar almacenar host o puertos en base de datos o estado:

```typescript
// src/utils/file-url.ts
export const getFileViewUrl = (key: string): string => {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  return `${baseUrl}/files/view/${encodeURIComponent(key)}`;
};
```

**Uso en Componentes de React (ej. FileGallery / Tablas):**
```tsx
import { getFileViewUrl } from '@/utils/file-url';

<img 
  src={getFileViewUrl(file.key)} 
  alt={file.originalName} 
  onError={(e) => { e.currentTarget.src = '/placeholder-file.svg'; }}
/>
```

---

#### 6. Eliminación de Archivo en S3 (`DELETE /files/:key`)
- **Acceso:** Protegido (`@RequirePermissions('files.delete')`, `@Roles('admin')`).
- **Headers:** `Authorization: Bearer <token>`.
- **Query Params:** `?bucket=...` (opcional).

**Contratos TypeScript:**
```typescript
export interface DeleteFileResponse {
  message: string; // "Archivo eliminado exitosamente"
}
```

**Ejemplo de Respuesta (200 OK):**
```json
{
  "message": "Archivo eliminado exitosamente"
}
```

**Acción Frontend:**
```typescript
export const deleteFileAction = async (key: string, bucket?: string): Promise<DeleteFileResponse> => {
  const response = await apiClient.delete<DeleteFileResponse>(`/files/${encodeURIComponent(key)}`, {
    params: { bucket },
  });
  return response.data;
};
```

---

### D. Dominio de Salud e Infraestructura (`/health`)

#### 1. Verificación de Estado de Servicios (`GET /health`)
- **Acceso:** Público (`@Public()`).
- **Descripción:** Endpoint administrado por `@nestjs/terminus`. Ejecuta en paralelo las 3 pruebas de salud críticas de la infraestructura:
  1. `database`: Ping a PostgreSQL mediante `PrismaHealthIndicator`.
  2. `redis`: Conexión directa enviando comando `PING` esperando respuesta `PONG`.
  3. `storage`: Verificación del bucket de almacenamiento en SeaweedFS/S3 (`ensureBucketExists`).

**Contratos TypeScript:**
```typescript
export interface HealthIndicatorDetail {
  status: 'up' | 'down';
  [key: string]: unknown;
}

export interface HealthCheckResponse {
  status: 'ok' | 'error' | 'shutting_down';
  info?: {
    database?: HealthIndicatorDetail;
    redis?: HealthIndicatorDetail;
    storage?: HealthIndicatorDetail;
  };
  error?: Record<string, HealthIndicatorDetail>;
  details: {
    database?: HealthIndicatorDetail;
    redis?: HealthIndicatorDetail;
    storage?: HealthIndicatorDetail;
  };
}
```

**Ejemplo de Respuesta Operacional (200 OK):**
```json
{
  "status": "ok",
  "info": {
    "database": {
      "status": "up"
    },
    "redis": {
      "status": "up"
    },
    "storage": {
      "status": "up"
    }
  },
  "error": {},
  "details": {
    "database": {
      "status": "up"
    },
    "redis": {
      "status": "up"
    },
    "storage": {
      "status": "up"
    }
  }
}
```

**Ejemplo de Respuesta Degradada (503 Service Unavailable):**
```json
{
  "status": "error",
  "info": {
    "database": {
      "status": "up"
    },
    "storage": {
      "status": "up"
    }
  },
  "error": {
    "redis": {
      "status": "down",
      "message": "Connection refused"
    }
  },
  "details": {
    "database": {
      "status": "up"
    },
    "redis": {
      "status": "down",
      "message": "Connection refused"
    },
    "storage": {
      "status": "up"
    }
  }
}
```

**Acción Frontend (`features/health/actions/health.actions.ts`):**
```typescript
export const fetchHealthStatusAction = async (): Promise<HealthCheckResponse> => {
  const response = await apiClient.get<HealthCheckResponse>('/health');
  return response.data;
};
```

---

### E. Dominio de Feature Flags y Rutas de Aplicación (`/` y `/beta-feature`)

#### 1. Mensaje de Bienvenida del API (`GET /`)
- **Acceso:** Público.
- **Retorno:** `string` (`"Hello World!"`).
- **HTTP Status:** `200 OK`.

---

#### 2. Endpoint Sujeto a Feature Flag en Caliente (`GET /beta-feature`)
- **Acceso:** Protegido por guard `FeatureFlagGuard` y decorador `@RequireFeature('BETA_FEATURE')`.
- **Headers:** `Authorization: Bearer <token>` (opcional para contextualizar evaluación por usuario o rol).
- **Descripción:** Si la bandera `BETA_FEATURE` está habilitada en Redis/PostgreSQL (y cumple con las reglas de usuario, rol o porcentaje), el endpoint permite la ejecución y responde `{ ok: true }`. Si está apagada, arroja `403 Forbidden` ("Esta funcionalidad está deshabilitada temporalmente").

**Contratos TypeScript:**
```typescript
export interface BetaFeatureResponse {
  ok: boolean;
}
```

**Ejemplo de Respuesta (200 OK):**
```json
{
  "ok": true
}
```

**Acción Frontend:**
```typescript
export const fetchBetaFeatureAction = async (): Promise<BetaFeatureResponse> => {
  const response = await apiClient.get<BetaFeatureResponse>('/beta-feature');
  return response.data;
};
```

---

### F. Modelos de Base de Datos y Formato Estándar de Errores

#### 1. Entidades del Dominio (Modelos de Prisma ORM)
Tipos sincronizados con los esquemas de Prisma para construir las tablas TanStack y formularios de administración:

```typescript
// 1. Usuario con roles y estado de 2FA
export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  emailVerifiedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: Array<{
    role: {
      name: string;
      permissions: Array<{
        permission: {
          slug: string;
        };
      }>;
    };
  }>;
  twoFactor?: {
    isEnabled: boolean;
  } | null;
}

// 2. Rol y Permiso RBAC
export interface RoleRecord {
  id: string;
  name: string; // "admin", "user", "auditor", etc.
  description: string | null;
  createdAt: string;
  updatedAt: string;
  permissions?: Array<{
    permission: PermissionRecord;
  }>;
}

export interface PermissionRecord {
  id: string;
  slug: string; // "files.upload", "files.read", "files.delete", "users:export", etc.
  description: string | null;
}

// 3. Registro de Auditoría para el Visor Diff
export interface AuditLogRecord {
  id: string;
  userId: string | null;
  action: string;      // "LOGIN", "UPDATE_USER", "UPLOAD_FILE", "DELETE_FILE"
  entity: string | null; // "users", "files", "roles"
  entityId: string | null;
  ipAddress: string;
  userAgent: string | null;
  method: string;      // "POST", "PATCH", "DELETE", "GET"
  endpoint: string;
  details: Record<string, unknown> | null; // JSON para el Side-by-Side Diff
  createdAt: string;
  user?: {
    id: string;
    email: string;
    name: string | null;
  } | null;
}

// 4. Feature Flag Dinámico
export interface FeatureFlagRules {
  allowedUsers?: string[];
  allowedRoles?: string[];
  percentage?: number; // 0 a 100 para despliegues progresivos
}

export interface FeatureFlagRecord {
  id: string;
  key: string;         // Ej: "BETA_FEATURE", "DARK_MODE_V2"
  description: string | null;
  isEnabled: boolean;
  rules: FeatureFlagRules | null;
  createdAt: string;
  updatedAt: string;
}
```

#### 2. Formato Canónico de Excepción (`HttpExceptionFilter`)
Todas las excepciones arrojadas por NestJS son formateadas por el filtro global `HttpExceptionFilter`:

```typescript
export interface ApiErrorResponse {
  statusCode: number;
  timestamp: string;     // ISO 8601
  path: string;          // URL de la petición
  method: string;        // "POST", "GET", etc.
  message: string | string[]; // Mensaje simple o lista de fallos de class-validator
  error?: string;        // Nombre del error HTTP (ej: "Bad Request", "Unauthorized")
}
```

**Ejemplo de Error por Fallo de Validación (400 Bad Request):**
```json
{
  "statusCode": 400,
  "timestamp": "2026-09-10T14:45:00.000Z",
  "path": "/auth/register",
  "method": "POST",
  "message": [
    "email must be an email",
    "password must be longer than or equal to 8 characters"
  ],
  "error": "Bad Request"
}
```

---

## 11. Principios de Diseño Responsivo (Mobile & Desktop)

| Dispositivo | Navegación | Tablas y Gestión de Datos | Modales y Formularios |
| :--- | :--- | :--- | :--- |
| **Desktop (>= 1024px)** | `Sidebar` retráctil colapsable con atajos por rol y `BentoGrid` en el dashboard. | Tabla interactiva virtualizada con cabeceras fijas, ordenamiento, switches in-line y selección múltiple. | Diálogos modulares centrados (`<Dialog>`). |
| **Móvil (< 1024px)** | Barra inferior flotante (*Bottom Tab Bar*) + `Sheet/Drawer` lateral para menú completo. | Conmutador automático a **Modo Cards** individuales por usuario o archivo con botón de acción rápida en un Drawer inferior. | Modales tipo **Drawer inferior táctil** deslizable (Vaul) que se cierran arrastrando hacia abajo. |

---

## 12. Instrucciones Paso a Paso para Iniciar el Proyecto

Ejecuta los siguientes comandos para inicializar el proyecto con todas las librerías necesarias:

```bash
# 1. Crear el proyecto Vite con TypeScript
pnpm create vite frontend --template react-ts
cd frontend

# 2. Instalar el motor de estilos y utilidades
pnpm add tailwindcss @tailwindcss/vite clsx tailwind-merge lucide-react vaul sonner next-themes

# 3. Instalar TanStack (Query, Table, Virtual) y Formularios
pnpm add @tanstack/react-query @tanstack/react-table @tanstack/react-virtual @tanstack/react-router
pnpm add react-hook-form @hookform/resolvers zod axios zustand

# 4. Instalar Gráficos y Animaciones SaaS
pnpm add recharts framer-motion

# 5. Inicializar y agregar componentes de shadcn/ui
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card dialog drawer input label table badge tabs dropdown-menu avatar progress switch sheet tooltip separator popover command skeleton breadcrumb
```

---

## 13. Checklist de Validación para el Agente Antigravity

El agente debe validar cada uno de los siguientes puntos antes de considerar finalizado el trabajo:

- [ ] **Cumplimiento Estricto de Contratos de API:** Todos los endpoints del catálogo en la Sección 10 están implementados con sus DTOs de entrada y tipos de respuesta exactos.
- [ ] **Protección Anti-Crash Google Translate:** `index.html` con atributos `translate="no"` y clase `notranslate`, textos dinámicos en JSX encapsulados en `<span>`, y polyfill preventivo en `main.tsx`.
- [ ] **Look & Feel SaaS Premium:** Se utilizan fondos sutiles de rejilla, modo oscuro con `next-themes`, bordes nítidos y microinteracciones con `framer-motion`.
- [ ] **Separación Arquitectónica de 2FA:** La lógica de autenticación en dos pasos reside en `features/two-factor/` conectándose a `/auth/2fa`.
- [ ] **Lazy Loading y Code-Splitting:** Las rutas se cargan bajo demanda con `React.lazy()` y `<Suspense>`.
- [ ] **App Preloader Inicial:** Se muestra una pantalla de bienvenida animada con barra de progreso mientras se verifican cookies y se cargan recursos.
- [ ] **Skeletons Adaptativos (Zero CLS):** Todas las tablas y paneles de métricas implementan siluetas pulsantes de `shadcn/ui Skeleton` en estados de carga.
- [ ] **Directorio de Usuarios y Control RBAC:** Tabla virtualizada con TanStack Table v8, switches optimistas de estatus y asignación modal de roles.
- [ ] **Gestión de Archivos S3 con Antivirus:** Dropzone de subida simple y múltiple, estados visuales de escaneo ClamAV y optimización WebP.
- [ ] **Auditoría con Diff JSON:** Visor modal interactivo para comparar cambios de registros de auditoría en formato Side-by-Side.
- [ ] **Observabilidad y Health Checks:** Monitoreo en vivo de PostgreSQL, Redis y SeaweedFS con reconsulta automática cada 30 segundos.
- [ ] **Persistencia Total con Zustand:** Al refrescar la página (`F5`), se conserva la sesión, el tema, el estado de la barra lateral y los filtros aplicados.
- [ ] **Seguridad y Step-Up Auth:** Las operaciones críticas (`POST /auth/critical-action`) solicitan el código TOTP y transmiten la cabecera `x-2fa-code`.
- [ ] **Manejo de Errores con Sonner:** Se interceptan errores HTTP mostrando notificaciones toast claras sin fugas técnicas.
- [ ] **Capa de Actions Desacoplada:** Las peticiones HTTP se definen como funciones asíncronas puras en `actions/` y son invocadas exclusivamente por custom hooks en `hooks/`, manteniendo los componentes de UI 100% aislados de Axios o llamadas directas de red.
- [ ] **Compilación Limpia:** `pnpm build` compila con cero errores y cero advertencias de TypeScript.
