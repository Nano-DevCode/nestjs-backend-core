import 'dotenv/config';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../prisma/generated/prisma/client';

export { Prisma, PrismaClient } from '../../prisma/generated/prisma/client';

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
  public readonly pool: Pool;

  constructor() {
    const dbPassword = process.env['DB_PASSWORD'];
    if (!dbPassword && process.env['NODE_ENV'] === 'production') {
      throw new Error('FATAL: DB_PASSWORD no está configurado en producción.');
    }

    const connectionString =
      process.env['DATABASE_URL'] ||
      `postgresql://${process.env['DB_USER'] || 'postgres'}:${dbPassword || ''}@localhost:${process.env['DB_PORT'] || 5432}/${process.env['DB_NAME'] || 'sistema'}?schema=public`;

    const pool = new Pool({
      connectionString,
      password: dbPassword || undefined,
    });

    const adapter = new PrismaPg(pool);

    super({ adapter });

    this.pool = pool;

    const extended = this.$extends(createSoftDeleteExtension());

    (
      extended as unknown as { onModuleInit: () => Promise<void> }
    ).onModuleInit = async () => {
      await this.$connect();
    };

    (
      extended as unknown as { onModuleDestroy: () => Promise<void> }
    ).onModuleDestroy = async () => {
      await this.$disconnect();
      await this.pool.end();
    };

    (extended as unknown as { pool: Pool }).pool = this.pool;

    return extended as unknown as PrismaService;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
