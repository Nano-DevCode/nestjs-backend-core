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

async function runAllSeeds() {
  console.log('🚀 [SEED] Ejecutando TODOS los seeders secuencialmente...\n');
  const startTime = Date.now();

  // 1. Permisos
  const permissions = await seedPermissions(prisma);

  // 2. Roles
  const roles = await seedRoles(prisma, permissions);

  // 3. Usuarios
  await seedUsers(prisma, roles);

  // 4. Feature Flags
  await seedFeatureFlags(prisma);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(
    `\n🎉 [SEED] Todos los seeders finalizaron con éxito en ${duration}s.`,
  );
}

async function runSingleSeed(target: string) {
  const normalized = target.toLowerCase().trim();
  const startTime = Date.now();

  switch (normalized) {
    case 'permissions':
    case 'perm':
    case 'perms':
      console.log(
        '🎯 [SEED] Ejecutando únicamente: Permisos (permissions.seed.ts)\n',
      );
      await seedPermissions(prisma);
      break;

    case 'roles':
    case 'role':
      console.log('🎯 [SEED] Ejecutando únicamente: Roles (roles.seed.ts)\n');
      await seedRoles(prisma);
      break;

    case 'users':
    case 'user':
      console.log(
        '🎯 [SEED] Ejecutando únicamente: Usuarios (users.seed.ts)\n',
      );
      await seedUsers(prisma);
      break;

    case 'flags':
    case 'feature-flags':
    case 'featureflags':
      console.log(
        '🎯 [SEED] Ejecutando únicamente: Feature Flags (feature-flags.seed.ts)\n',
      );
      await seedFeatureFlags(prisma);
      break;

    case 'help':
    case '--help':
    case '-h':
    case '--list':
      console.log(`
📋 SEEDERS DISPONIBLES EN EL SISTEMA:
======================================
• pnpm seed                 -> Ejecuta TODOS los seeders en orden
• pnpm seed permissions     -> Ejecuta solo permisos (permissions.seed.ts)
• pnpm seed roles           -> Ejecuta solo roles (roles.seed.ts)
• pnpm seed users           -> Ejecuta solo usuarios (users.seed.ts)
• pnpm seed flags           -> Ejecuta solo feature flags (feature-flags.seed.ts)
      `);
      return;

    default:
      console.error(`❌ [SEED] Seeder no reconocido: "${target}".`);
      console.log(`
Opciones válidas:
  - pnpm seed (o pnpm seed all)
  - pnpm seed permissions
  - pnpm seed roles
  - pnpm seed users
  - pnpm seed flags
      `);
      process.exit(1);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(
    `\n✅ [SEED] Seeder "${normalized}" completado con éxito en ${duration}s.`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const target = args[0];

  if (!target || target === 'all') {
    await runAllSeeds();
  } else {
    await runSingleSeed(target);
  }
}

main()
  .catch((e: unknown) => {
    console.error('❌ Error fatal ejecutando seeds:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
