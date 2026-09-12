import { PrismaClient } from '../generated/prisma/client';
import * as bcrypt from 'bcrypt';

export async function seedUsers(
  prisma: PrismaClient,
  roles: { adminRole: { id: string }; userRole: { id: string } },
) {
  console.log('⏳ Sembrando usuarios de prueba...');

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
          roleId: roles.adminRole.id,
        },
      },
    },
  });

  console.log(`✅ Usuario administrador listo (${adminUser.email}).`);
}
