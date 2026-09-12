# ============================================================================
# DOCKERFILE MULTI-STAGE DE PRODUCCIÓN - NESTJS ENTERPRISE API
# Optimizado para tamaño mínimo, seguridad OWASP (non-root) y alto rendimiento
# ============================================================================

# ----------------------------------------------------------------------------
# 1. Base Image: Node.js 22 LTS en Debian Bookworm Slim
# Proporciona glibc, OpenSSL y compatibilidad total con Sharp, Bcrypt y Prisma
# ----------------------------------------------------------------------------
FROM node:22-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Instalar herramientas esenciales del sistema y dumb-init para control de procesos PID 1
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    curl \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

# ----------------------------------------------------------------------------
# 2. Dependencies Stage: Instalación de todas las dependencias
# ----------------------------------------------------------------------------
FROM base AS deps

# Herramientas de compilación nativa C++ para bcrypt y módulos binarios
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./

RUN pnpm install --frozen-lockfile

# ----------------------------------------------------------------------------
# 3. Builder Stage: Generación de Prisma Client y Compilación de NestJS
# ----------------------------------------------------------------------------
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* tsconfig.json tsconfig.build.json nest-cli.json prisma7.config.ts ./
COPY prisma ./prisma
COPY src ./src

# Generar cliente de base de datos Prisma 7
RUN npx prisma generate

# Compilar proyecto NestJS a código de producción
RUN pnpm run build

# Limpiar dependencias de desarrollo para aligerar la imagen de producción
RUN pnpm prune --prod

# ----------------------------------------------------------------------------
# 4. Production Runner Stage: Imagen final ultra-ligera y segura
# ----------------------------------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Copiar artefactos compilados y dependencias de producción con permisos del usuario node
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/package.json ./package.json

# Ejecución bajo usuario sin privilegios root (Buenas prácticas de seguridad)
USER node

EXPOSE 3000

# Healthcheck nativo contra el endpoint /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# dumb-init captura señales de terminación (SIGINT/SIGTERM) para apagado elegante (graceful shutdown)
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["node", "dist/src/main.js"]

