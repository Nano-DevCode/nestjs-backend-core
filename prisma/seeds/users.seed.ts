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

  let adminRoleId = roles?.adminRole?.id;
  if (!adminRoleId) {
    const found = await prisma.role.findFirst({
      where: { name: 'admin' },
      select: { id: true },
    });
    adminRoleId = found?.id;
  }

  let userRoleId = roles?.userRole?.id;
  if (!userRoleId) {
    const found = await prisma.role.findFirst({
      where: { name: 'user' },
      select: { id: true },
    });
    userRoleId = found?.id;
  }

  const hashedPassword = await bcrypt.hash('AdminPassword123!', 10);
  const userPassword = await bcrypt.hash('UserPassword123!', 10);

  // 1. Superadmin User
  const adminEmail = 'admin@sistema.com';
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      emailVerifiedAt: new Date(),
      name: 'Super Administrador Sistema',
      profile: {
        upsert: {
          create: {
            firstName: 'Super',
            firstLastName: 'Administrador',
            secondLastName: 'Sistema',
          },
          update: {
            firstName: 'Super',
            firstLastName: 'Administrador',
            secondLastName: 'Sistema',
          },
        },
      },
    },
    create: {
      email: adminEmail,
      name: 'Super Administrador Sistema',
      password: hashedPassword,
      isActive: true,
      emailVerifiedAt: new Date(),
      roles: {
        create: {
          roleId: superadminRoleId,
        },
      },
      profile: {
        create: {
          firstName: 'Super',
          firstLastName: 'Administrador',
          secondLastName: 'Sistema',
        },
      },
    },
  });

  // 2. Operador Admin User
  if (adminRoleId) {
    const opEmail = 'operador@sistema.com';
    await prisma.user.upsert({
      where: { email: opEmail },
      update: {
        emailVerifiedAt: new Date(),
        name: 'Carlos Operador Morales',
        profile: {
          upsert: {
            create: {
              firstName: 'Carlos',
              firstLastName: 'Operador',
              secondLastName: 'Morales',
            },
            update: {
              firstName: 'Carlos',
              firstLastName: 'Operador',
              secondLastName: 'Morales',
            },
          },
        },
      },
      create: {
        email: opEmail,
        name: 'Carlos Operador Morales',
        password: hashedPassword,
        isActive: true,
        emailVerifiedAt: new Date(),
        roles: {
          create: {
            roleId: adminRoleId,
          },
        },
        profile: {
          create: {
            firstName: 'Carlos',
            firstLastName: 'Operador',
            secondLastName: 'Morales',
          },
        },
      },
    });
  }

  // 3. Regular User
  if (userRoleId) {
    const userEmail = 'usuario@sistema.com';
    await prisma.user.upsert({
      where: { email: userEmail },
      update: {
        emailVerifiedAt: new Date(),
        name: 'María López Sánchez',
        profile: {
          upsert: {
            create: {
              firstName: 'María',
              firstLastName: 'López',
              secondLastName: 'Sánchez',
            },
            update: {
              firstName: 'María',
              firstLastName: 'López',
              secondLastName: 'Sánchez',
            },
          },
        },
      },
      create: {
        email: userEmail,
        name: 'María López Sánchez',
        password: userPassword,
        isActive: true,
        emailVerifiedAt: new Date(),
        roles: {
          create: {
            roleId: userRoleId,
          },
        },
        profile: {
          create: {
            firstName: 'María',
            firstLastName: 'López',
            secondLastName: 'Sánchez',
          },
        },
      },
    });
  }

  console.log(`✅ Usuarios sembrados exitosamente con perfiles completos (${adminUser.email}).`);
}

