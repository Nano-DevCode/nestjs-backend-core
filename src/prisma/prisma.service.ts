import 'dotenv/config';
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { readReplicas } from '@prisma/extension-read-replicas';
import { Prisma, PrismaClient } from '../../prisma/generated/prisma/client';

export { Prisma, PrismaClient } from '../../prisma/generated/prisma/client';

interface HasReplicaMethod {
  $replica: () => unknown;
}

function isReplicaCapable(target: unknown): target is HasReplicaMethod {
  return (
    typeof target === 'object' &&
    target !== null &&
    '$replica' in target &&
    typeof (target as HasReplicaMethod).$replica === 'function'
  );
}

export function createSoftDeleteExtension() {
  return Prisma.defineExtension({
    name: 'softDelete',
    query: {
      user: {
        async findMany({ args, query }) {
          args.where = { deletedAt: null, ...args.where };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { deletedAt: null, ...args.where };
          return query(args);
        },
        async findUnique({ args, query }) {
          const result = await query(args);
          if (
            result &&
            typeof result === 'object' &&
            'deletedAt' in result &&
            result.deletedAt !== null
          ) {
            return null;
          }
          return result;
        },
      },
    },
  });
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  public readonly pool: Pool;
  public readonly replicaPool?: Pool;
  public readonly hasReplica: boolean;

  get readOnly(): this {
    if (this.hasReplica && isReplicaCapable(this)) {
      return this.$replica() as this;
    }
    return this;
  }

  constructor() {
    let dbPassword = process.env['DB_PASSWORD'];
    const connectionString =
      process.env['DATABASE_URL'] ||
      `postgresql://${process.env['DB_USER'] || 'postgres'}:${dbPassword || ''}@localhost:${process.env['DB_PORT'] || 5432}/${process.env['DB_NAME'] || 'sistema'}?schema=public`;

    if (!dbPassword && connectionString) {
      try {
        const parsed = new URL(connectionString);
        if (parsed.password) {
          dbPassword = decodeURIComponent(parsed.password);
        }
      } catch {
        // Fallback silencioso si no es una URL parseable
      }
    }

    if (!dbPassword && process.env['NODE_ENV'] === 'production') {
      throw new Error('FATAL: DB_PASSWORD no está configurado en producción.');
    }

    const poolMax = Number(process.env['DB_POOL_MAX']) || 50;
    const poolMin = Number(process.env['DB_POOL_MIN']) || 10;
    const poolTimeoutMs = Number(process.env['DB_POOL_TIMEOUT_MS']) || 10000;

    const pool = new Pool({
      connectionString,
      password: dbPassword || undefined,
      max: poolMax,
      min: poolMin,
      connectionTimeoutMillis: poolTimeoutMs,
      idleTimeoutMillis: 10000,
      statement_timeout: 10000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });

    const adapter = new PrismaPg(pool);

    super({ adapter });

    this.pool = pool;

    const replicaUrl = process.env['DATABASE_REPLICA_URL']?.trim();
    const hasReplica = Boolean(replicaUrl && replicaUrl.length > 0);
    let replicaPool: Pool | undefined;
    let replicaClient: unknown;

    if (hasReplica && replicaUrl) {
      this.logger.log(
        'Soporte de Read Replica activado (DATABASE_REPLICA_URL detectada).',
      );
      replicaPool = new Pool({
        connectionString: replicaUrl,
        max: poolMax,
        min: poolMin,
        connectionTimeoutMillis: poolTimeoutMs,
        idleTimeoutMillis: 10000,
        statement_timeout: 10000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
      });

      const replicaAdapter = new PrismaPg(replicaPool);
      replicaClient = new PrismaClient({ adapter: replicaAdapter }).$extends(
        createSoftDeleteExtension(),
      );
      this.replicaPool = replicaPool;
    } else {
      this.logger.log(
        'Modo base de datos única activo (Primary). Read replica no configurada o en fallback.',
      );
    }

    this.hasReplica = hasReplica;

    let extended = this.$extends(createSoftDeleteExtension());

    if (hasReplica && replicaClient) {
      extended = extended.$extends(
        readReplicas({
          replicas: [replicaClient as unknown as PrismaClient],
        }),
      );
    }

    (
      extended as unknown as { onModuleInit: () => Promise<void> }
    ).onModuleInit = async () => {
      await (extended as unknown as PrismaClient).$connect();
    };

    (
      extended as unknown as { onModuleDestroy: () => Promise<void> }
    ).onModuleDestroy = async () => {
      await (extended as unknown as PrismaClient).$disconnect();
      await this.pool.end();
      if (replicaPool) {
        await replicaPool.end();
      }
    };

    (extended as unknown as { pool: Pool }).pool = this.pool;
    if (replicaPool) {
      (extended as unknown as { replicaPool: Pool }).replicaPool = replicaPool;
    }
    (extended as unknown as { hasReplica: boolean }).hasReplica = hasReplica;

    Object.defineProperty(extended, 'readOnly', {
      get() {
        if (hasReplica && isReplicaCapable(extended)) {
          return extended.$replica();
        }
        return extended;
      },
      enumerable: true,
      configurable: true,
    });

    return extended as unknown as PrismaService;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
    if (this.replicaPool) {
      await this.replicaPool.end();
    }
  }
}
