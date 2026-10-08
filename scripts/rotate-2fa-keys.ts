import { PrismaPg } from '@prisma/adapter-pg';
import * as crypto from 'crypto';
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaClient, type Prisma } from '../prisma/generated/prisma/client';

type UserTwoFactorWithEmail = Prisma.UserTwoFactorGetPayload<{
  include: {
    user: {
      select: { email: true };
    };
  };
}>;

/**
 * Script de Rotación Criptográfica de Secretos 2FA (AES-256-GCM)
 *
 * Permite cambiar la variable TWO_FACTOR_ENCRYPTION_KEY sin invalidar los códigos
 * de Google Authenticator / TOTP que los usuarios ya tienen en sus teléfonos móviles.
 *
 * Uso:
 *   pnpm tsx scripts/rotate-2fa-keys.ts <CLAVE_ANTERIOR> <CLAVE_NUEVA>
 *
 * O dentro del contenedor de Docker:
 *   docker compose exec -T api npx tsx scripts/rotate-2fa-keys.ts <CLAVE_ANTERIOR> <CLAVE_NUEVA>
 */

const ALGORITHM = 'aes-256-gcm';

function deriveKey(rawKey: string): Buffer {
  return crypto.createHash('sha256').update(rawKey).digest();
}

function decryptSecret(ciphertext: string, oldKeyBuffer: Buffer): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Formato de secreto inválido (debe ser iv:tag:data)');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, oldKeyBuffer, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

function encryptSecret(plaintext: string, newKeyBuffer: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, newKeyBuffer, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

async function main() {
  const args = process.argv.slice(2);
  const oldKey = args[0] || process.env.OLD_TWO_FACTOR_KEY;
  const newKey = args[1] || process.env.NEW_TWO_FACTOR_KEY;

  console.log(
    '\n=================================================================',
  );
  console.log(
    '      ROTACIÓN CRIPTOGRÁFICA DE SECRETOS 2FA (AES-256-GCM)       ',
  );
  console.log(
    '=================================================================\n',
  );

  if (!oldKey || !newKey) {
    console.error(
      '❌ Error: Debes especificar la clave anterior y la nueva clave.',
    );
    console.log('\nUso:');
    console.log(
      '  pnpm tsx scripts/rotate-2fa-keys.ts <CLAVE_ANTERIOR> <CLAVE_NUEVA>\n',
    );
    console.log('Ejemplo:');
    console.log(
      '  pnpm tsx scripts/rotate-2fa-keys.ts "mi_clave_antigua_de_32_caracteres" "mi_nueva_clave_segura_de_32_caracteres"\n',
    );
    process.exit(1);
  }

  if (oldKey.length < 32 || newKey.length < 32) {
    console.error(
      '❌ Error: Ambas claves deben tener una longitud mínima de 32 caracteres.',
    );
    process.exit(1);
  }

  if (oldKey === newKey) {
    console.error(
      '❌ Error: La nueva clave debe ser diferente de la clave anterior.',
    );
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ Error: Variable de entorno DATABASE_URL no encontrada.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const oldKeyBuffer = deriveKey(oldKey);
  const newKeyBuffer = deriveKey(newKey);

  try {
    const records: UserTwoFactorWithEmail[] =
      await prisma.userTwoFactor.findMany({
        where: {
          isEnabled: true,
          secret: { not: '' },
        },
        include: {
          user: {
            select: { email: true },
          },
        },
      });

    console.log(
      `🔍 Se encontraron ${records.length} registro(s) 2FA activos en la base de datos.\n`,
    );

    if (records.length === 0) {
      console.log(
        'ℹ️ No hay usuarios con 2FA activo para re-cifrar. Proceso concluido.',
      );
      return;
    }

    let successCount = 0;
    let failedCount = 0;

    for (const record of records) {
      const email = record.user?.email || record.userId;
      try {
        if (!record.secret) continue;

        // 1. Descifrar con clave anterior
        const plaintextSecret = decryptSecret(record.secret, oldKeyBuffer);

        // 2. Cifrar con clave nueva
        const newEncryptedSecret = encryptSecret(plaintextSecret, newKeyBuffer);

        // 3. Persistir en base de datos
        await prisma.userTwoFactor.update({
          where: { id: record.id },
          data: { secret: newEncryptedSecret },
        });

        console.log(`  ✅ [OK] Re-cifrado exitoso para: ${email}`);
        successCount++;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(
          `  ❌ [FALLO] No se pudo re-cifrar para ${email}: ${errorMsg}`,
        );
        failedCount++;
      }
    }

    console.log(
      '\n-----------------------------------------------------------------',
    );
    console.log(`📊 Resumen de rotación:`);
    console.log(`   - Exitosos: ${successCount}`);
    console.log(`   - Fallidos: ${failedCount}`);
    console.log(
      '-----------------------------------------------------------------\n',
    );

    if (successCount > 0) {
      console.log('🚀 Pasos siguientes obligatorios:');
      console.log(
        '   1. Actualiza TWO_FACTOR_ENCRYPTION_KEY en tu archivo .env.production con la nueva clave.',
      );
      console.log('   2. Reinicia el backend: docker compose restart api\n');
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error fatal durante la rotación:', err);
  process.exit(1);
});
