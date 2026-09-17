import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { seedPermissions } from './permissions.seed';
import { seedRoles } from './roles.seed';
import { seedUsers } from './users.seed';
import { seedFeatureFlags } from './feature-flags.seed';

const connectionString = process.env['DATABASE_URL'];
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🚀 Iniciando ejecución de seeds...');

  // 1. Permisos
  const permissions = await seedPermissions(prisma);

  // 2. Roles vinculados a permisos
  const roles = await seedRoles(prisma, permissions);

  // 3. Usuarios vinculados a roles
  await seedUsers(prisma, roles);

  // 4. Feature Flags del sistema
  await seedFeatureFlags(prisma);

  console.log('🎉 Todos los seeds finalizaron con éxito.');
}

main()
  .catch((e: unknown) => {
    console.error('❌ Error ejecutando seeds:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
