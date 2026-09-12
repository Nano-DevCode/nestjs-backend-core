import { PrismaClient } from '../generated/prisma/client';

export async function seedPermissions(prisma: PrismaClient) {
  console.log('⏳ Sembrando permisos...');

  const permissions = [
    { slug: 'users:read', description: 'Consultar usuarios' },
    { slug: 'users:create', description: 'Crear nuevos usuarios' },
    { slug: 'users:update', description: 'Editar usuarios' },
    { slug: 'users:delete', description: 'Eliminar usuarios' },
    { slug: 'users:export', description: 'Exportar listas de usuarios' },
    { slug: 'roles:manage', description: 'Administrar roles y permisos' },
  ];

  const results = await Promise.all(
    permissions.map((perm) =>
      prisma.permission.upsert({
        where: { slug: perm.slug },
        update: {},
        create: perm,
      }),
    ),
  );

  console.log(`✅ ${results.length} permisos listos.`);
  return results;
}
