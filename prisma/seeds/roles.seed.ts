import { PrismaClient } from '../generated/prisma/client';

export async function seedRoles(
  prisma: PrismaClient,
  permissions?: { id: string; slug: string }[],
) {
  console.log('⏳ Sembrando roles y asignaciones...');

  // Si no se proporcionaron permisos, buscarlos en la base de datos
  const targetPermissions =
    permissions && permissions.length > 0
      ? permissions
      : await prisma.permission.findMany({ select: { id: true, slug: true } });

  // 1. Crear roles
  const superadminRole = await prisma.role.upsert({
    where: { name: 'superadmin' },
    update: {
      priority: 100,
    },
    create: {
      name: 'superadmin',
      description: 'Dueño absoluto de la plataforma con máxima jerarquía',
      priority: 100,
    },
  });

  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {
      priority: 90,
    },
    create: {
      name: 'admin',
      description: 'Administrador operativo de la plataforma',
      priority: 90,
    },
  });

  const userRole = await prisma.role.upsert({
    where: { name: 'user' },
    update: {
      priority: 10,
    },
    create: {
      name: 'user',
      description: 'Usuario regular con permisos básicos',
      priority: 10,
    },
  });

  // 2. Asignar todos los permisos a los roles superadmin y admin
  for (const perm of targetPermissions) {
    // Permisos a superadmin
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superadminRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: superadminRole.id,
        permissionId: perm.id,
      },
    });

    // Permisos a admin
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
  const readPerm = targetPermissions.find((p) => p.slug === 'users:read');
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
  return { superadminRole, adminRole, userRole };
}
