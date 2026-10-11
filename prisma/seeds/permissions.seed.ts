import { PrismaClient } from '../generated/prisma/client';
import { SYSTEM_PERMISSIONS } from '../../src/auth/constants/permissions.constant';

export async function seedPermissions(prisma: PrismaClient) {
  console.log('⏳ Sembrando permisos del catálogo oficial...');

  const results = await Promise.all(
    SYSTEM_PERMISSIONS.map((perm) =>
      prisma.permission.upsert({
        where: { slug: perm.slug },
        update: {
          description: perm.description,
        },
        create: {
          slug: perm.slug,
          description: perm.description,
        },
      }),
    ),
  );

  console.log(
    `✅ ${results.length} permisos oficiales verificados en base de datos.`,
  );
  return results;
}
