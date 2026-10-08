import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaClient } from '../prisma/generated/prisma/client';

async function main() {
  const email = process.argv[2];

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ Error: DATABASE_URL no está configurada.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    if (!email) {
      console.log('Uso: pnpm tsx scripts/reset-2fa.ts <email_del_usuario>');
      console.log('Ejemplo: pnpm tsx scripts/reset-2fa.ts admin@sistema.com\n');

      const activeUsers = await prisma.userTwoFactor.findMany({
        where: { isEnabled: true },
        include: { user: { select: { email: true } } },
      });

      console.log(
        `Usuarios con 2FA activo actualmente (${activeUsers.length}):`,
      );
      for (const u of activeUsers) {
        console.log(` - ${u.user?.email || u.userId}`);
      }
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { twoFactor: true },
    });

    if (!user) {
      console.error(`❌ No se encontró usuario con el correo: ${email}`);
      process.exit(1);
    }

    if (!user.twoFactor) {
      console.log(
        `ℹ️ El usuario ${email} no tiene registro de 2FA configurado.`,
      );
      return;
    }

    await prisma.userTwoFactor.update({
      where: { userId: user.id },
      data: {
        isEnabled: false,
        backupCodes: [],
      },
    });

    console.log(`✅ 2FA desactivado exitosamente para el usuario: ${email}`);
    console.log(`   - isEnabled: false`);
    console.log(
      `   - Ahora puede iniciar sesión directamente sin 2FA o volver a enrolarse escaneando el código QR.`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
