# Guía Completa de Configuración y Operación: Bot de Música AntiGravity (Discord.js v14 + Lavalink v4)

Esta guía documenta en detalle la arquitectura, aprovisionamiento, despliegue y control operativo del módulo de música para Discord integrado en el ecosistema NestJS / React.

---

## 1. Arquitectura del Módulo y Feature Flagging

El módulo de bot de música ha sido diseñado bajo una arquitectura de **Impacto Cero** (Zero-Overhead).

```
┌────────────────────────────────────────────────────────┐
│                   DISCORD BOT MODULE                   │
│                                                        │
│  DISCORD_BOT_ENABLED=false ──> No Gateway / No Lavalink│
│                                Retorna 503 en API REST │
│                                                        │
│  DISCORD_BOT_ENABLED=true  ──> Inicializa Clientes:    │
│    ├── DiscordGateway (Discord.js v14 Gateway WS)      │
│    ├── LavalinkService (Shoukaku v4 Node WebSocket)    │
│    ├── QueueManagerService (Colas en memoria por Guild)│
│    ├── DiscordPlaybackService (Orquestador de audio)   │
│    └── DiscordGuildService (Persistencia en Postgres)  │
└────────────────────────────────────────────────────────┘
```

### Comportamiento del Feature Flag:
- **Backend (`DISCORD_BOT_ENABLED=false`)**:
  - `DiscordGateway` y `LavalinkService` no inician ninguna conexión de red ni escuchan puertos.
  - Los endpoints `/api/discord/*` responden de forma controlada con un código `503 Service Unavailable`.
  - Las tareas y cron jobs de la aplicación base continúan ejecutándose normalmente sin interferencias.
- **Frontend (`VITE_FEATURE_DISCORD_BOT=false`)**:
  - Se excluye la ruta `/admin/discord-bot` del enrutador de Vite/React Router.
  - Se oculta la opción "Bot Discord" del menú de navegación y del cajón móvil.

---

## 2. Configuración en Discord Developer Portal

Para vincular el bot con la aplicación de Discord:

1. Ingresa a [Discord Developer Portal](https://discord.com/developers/applications).
2. Crea una nueva aplicación haciendo clic en **New Application** (ej. `AntiGravity Music`).
3. Ve a la pestaña **Bot**:
   - Copia el Token haciendo clic en **Reset Token** -> Guarda el valor en `DISCORD_BOT_TOKEN`.
   - **Privileged Gateway Intents (OBLIGATORIO)**:
     - Activa: `SERVER MEMBERS INTENT`
     - Activa: `MESSAGE CONTENT INTENT`
4. Ve a la pestaña **OAuth2 -> URL Generator**:
   - **Scopes**:
     - `bot`
     - `applications.commands`
   - **Bot Permissions**:
     - *General Permissions*: View Channels.
     - *Text Permissions*: Send Messages, Send Messages in Threads, Embed Links, Attach Files, Read Message History, Use External Emojis, Add Reactions.
     - *Voice Permissions*: Connect, Speak, Priority Speaker, Use Voice Activity.
   - Copia la URL generada al final y ábrela en un navegador para invitar al bot al servidor donde desees usarlo.
5. Copia el **Application ID** de la pestaña *General Information* -> Guarda el valor en `DISCORD_CLIENT_ID`.

---

## 3. Puesta en Marcha de Lavalink v4 (Docker)

El contenedor de audio corre sobre Lavalink v4 Alpine (`ghcr.io/lavalink-devs/lavalink:4-alpine`), delegando la decodificación de audio, transcodificación a Opus y streaming en tiempo real para mantener el event-loop de Node.js libre de carga de CPU.

### Configuración incluida (`docker/lavalink/application.yml`):
- Soporte para fuentes de audio: YouTube, SoundCloud, Twitch, HTTP/HTTPS directos.
- Soporte de metadatos Spotify y fuentes secundarias vía LavaSrc.
- Buffer de audio optimizado (400ms frame buffer, 5000ms buffer duration).

### Iniciar el contenedor con Docker Compose:
Lavalink está configurado con el perfil `with-lavalink` para no iniciar por defecto en despliegues mínimos:

```bash
# Iniciar base de datos + redis + lavalink
docker compose --profile with-lavalink up -d lavalink

# O levantar todos los servicios incluyendo la API y Lavalink
docker compose --profile with-lavalink up -d
```

---

## 4. Variables de Entorno

Agrega las siguientes variables en tu archivo `.env` del backend:

```env
# =============================================================================
# 14. DISCORD MUSIC BOT & LAVALINK V4
# =============================================================================
DISCORD_BOT_ENABLED=true
DISCORD_BOT_TOKEN=OTg3NjU0MzIxMDk4NzY1NDMy.XXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXXX
DISCORD_CLIENT_ID=123456789012345678
LAVALINK_HOST=localhost
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass
LAVALINK_SECURE=false

# Opcional: Integración de metadatos Spotify
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

Y en el `.env` del frontend (`Sistema_Front`):

```env
VITE_FEATURE_DISCORD_BOT=true
```

---

## 5. Registro y Sincronización de Slash Commands

Los comandos Slash de Discord v14 (`/play`, `/pause`, etc.) se registran en la API REST de Discord mediante el script CLI dedicado:

```bash
# Registrar comandos en la API de Discord
pnpm ts-node scripts/register-commands.ts
```

> **Nota:** Si defines la variable de entorno `DISCORD_GUILD_ID=TU_ID_DE_SERVIDOR`, el script registrará los comandos instantáneamente en ese servidor específico (ideal para pruebas y desarrollo). Si omites la variable, se registran globalmente en Discord (propagación de hasta 1 hora en los servidores de Discord).

---

## 6. Catálogo de Comandos Slash

| Comando | Parámetros | Descripción |
| :--- | :--- | :--- |
| `/play` | `query` *(Obligatorio)*: Título, URL de YouTube, Spotify o SoundCloud. | Conecta al canal de voz del usuario y reproduce o encola la pista solicitada. |
| `/pause` | Ninguno | Pausa la reproducción del reproductor activo. |
| `/resume` | Ninguno | Reanuda la reproducción pausada. |
| `/skip` | Ninguno | Salta a la siguiente pista disponible en la cola. |
| `/back` | Ninguno | Reproduce la pista anterior guardada en el historial de sesión. |
| `/seek` | `segundos` *(Obligatorio)*: Posición a buscar en la pista actual. | Desplaza el cabezal de reproducción a la marca de tiempo indicada. |
| `/queue` | Ninguno | Muestra en un embed elegante la lista de reproducción pendiente y duración total. |
| `/remove` | `indice` *(Obligatorio)*: Posición numérica del track a remover (inicia en 1). | Elimina una pista específica de la cola. |
| `/clear` | Ninguno | Vacía por completo la cola de reproducción del servidor. |
| `/stop` | Ninguno | Detiene la música y vacía la cola. |
| `/join` | Ninguno | Une el bot al canal de voz donde se encuentre el usuario. |
| `/leave` | Ninguno | Desconecta el bot del canal de voz y destruye el reproductor. |

---

## 7. API REST y Dashboard de Administración

El backend expone endpoints REST seguros protegidos con `JwtAuthGuard` y `RolesGuard(['admin'])`:

- **`GET /api/discord/status`**: Estado de conexión de Discord Gateway, nodo Lavalink, cantidad de servidores y reproductores activos.
- **`GET /api/discord/guilds`**: Listado de servidores en los que participa el bot, canales de voz disponibles y estado de cola actual.
- **`GET /api/discord/queue/:guildId`**: Obtiene la pista actual, progreso en milisegundos, lista de tracks en cola e historial.
- **`POST /api/discord/playback/:guildId`**: Ejecuta acciones en tiempo real (`play`, `pause`, `resume`, `skip`, `back`, `seek`, `volume`, `stop`, `leave`).
- **`DELETE /api/discord/queue/:guildId/tracks/:index`**: Elimina un elemento de la cola.
- **`DELETE /api/discord/queue/:guildId`**: Vacía la cola.

En el frontend, el módulo se encuentra disponible para los administradores en:
**`http://localhost:5173/admin/discord-bot`**
Contando con:
- Selector de servidor dinámico.
- Mini-reproductor interactivo con portada, nombre de autor, barras de progreso dinámicas y control de volumen (0% a 200%).
- Buscador directo de pistas con selección de canal de voz.
- Visor de cola con botón de eliminación por ítem y pestaña de historial de reproducción.

---

## 8. Trigger Natural por Mensaje de Texto ("Perrito Pon la Música")

Además de los comandos Slash `/play`, el bot cuenta con un detector natural en canales de texto:

- **Patrón Regex**: `^(?:boot|bot)\s+perrito\s+pon\s+la\s+m[uú]sica(?:\s+(.*))?$/i`
- **Ejemplos válidos**:
  - `boot perrito pon la musica bohemian rhapsody`
  - `bot perrito pon la música https://open.spotify.com/track/...`
  - `boot perrito pon la musica lofi hip hop`
- **Comportamiento**:
  1. Si no se incluye una búsqueda: `"¡Guau! Dime qué canción o enlace quieres que ponga."`
  2. Si el usuario no está en un canal de voz: `"¡Guau! 🐶 Necesitas estar conectado en un canal de voz para que pueda poner la música."`
  3. Si la búsqueda arroja resultados, conecta al canal de voz, encola o reproduce inmediatamente, envía un mensaje de confirmación y emite los eventos WebSockets para actualizar el dashboard web en tiempo real.

---

## 9. Sincronización en Tiempo Real vía WebSockets (Socket.IO)

El panel web se sincroniza instantáneamente con Lavalink y Discord a través del namespace `/realtime/discord-bot`:

- **Salas por Servidor**: El frontend se une a la sala del servidor activo mediante el evento `join-guild-room` con `{ guildId }` y se retira con `leave-guild-room`.
- **Eventos Emitidos por el Servidor**:
  - `discord:queue-updated`: Emitido al agregar (`/play`), eliminar (`/remove`), vaciar (`/clear`) o cambiar de pista.
  - `discord:track-start`: Emitido cuando una pista comienza su reproducción en Lavalink.
  - `discord:playback-state`: Cambios de pausa, reanudación, volumen o detención (`playing`, `paused`, `stopped`).
  - `discord:track-progress`: Ticker de progreso periódico (cada 1.000 ms) con `{ position, duration, isPaused }`.
- **Zero-Polling**: La UI no satura la red con llamadas repetitivas; las barras de progreso y listas de reproducción se recalculan y renderizan en vivo ante la llegada de cada frame WebSocket.


