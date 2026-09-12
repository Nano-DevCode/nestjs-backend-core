import { PrismaClient } from '../generated/prisma/client';

export async function seedRoles(
  prisma: PrismaClient,
  permissions: { id: string; slug: string }[],
) {
  console.log('⏳ Sembrando roles y asignaciones...');

  // 1. Crear roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: {
      name: 'admin',
      description: 'Acceso total a la plataforma',
    },
  });

  const userRole = await prisma.role.upsert({
    where: { name: 'user' },
    update: {},
    create: {
      name: 'user',
      description: 'Usuario regular con permisos básicos',
    },
  });

  // 2. Asignar todos los permisos al rol admin
  for (const perm of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: perm.id,
      },
    });
  }

  // 3. Asignar únicamente lectura básica al rol user
  const readPerm = permissions.find((p) => p.slug === 'users:read');
  if (readPerm) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: userRole.id,
          permissionId: readPerm.id,
        },
      },
      update: {},
      create: {
        roleId: userRole.id,
        permissionId: readPerm.id,
      },
    });
  }

  console.log('✅ Roles vinculados con permisos.');
  return { adminRole, userRole };
}
