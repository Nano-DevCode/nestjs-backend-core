import { PrismaClient } from '../generated/prisma/client';
import * as bcrypt from 'bcrypt';

export async function seedUsers(
  prisma: PrismaClient,
  roles?: {
    superadminRole?: { id: string };
    adminRole?: { id: string };
    userRole?: { id: string };
  },
) {
  console.log('⏳ Sembrando usuarios de prueba...');

  let superadminRoleId = roles?.superadminRole?.id;
  if (!superadminRoleId) {
    const found = await prisma.role.findFirst({
      where: { name: 'superadmin' },
      select: { id: true },
    });
    if (!found) {
      throw new Error(
        'El rol superadmin no existe en la BD. Ejecuta primero el seeder de roles: pnpm seed roles',
      );
    }
    superadminRoleId = found.id;
  }

  const adminEmail = 'admin@sistema.com';
  const hashedPassword = await bcrypt.hash('AdminPassword123!', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      emailVerifiedAt: new Date(),
    },
    create: {
      email: adminEmail,
      name: 'Super Admin',
      password: hashedPassword,
      isActive: true,
      emailVerifiedAt: new Date(),
      roles: {
        create: {
          roleId: superadminRoleId,
        },
      },
    },
  });

  console.log(`✅ Usuario administrador listo (${adminUser.email}).`);
}
