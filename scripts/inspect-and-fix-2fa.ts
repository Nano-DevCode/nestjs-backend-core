import { PrismaPg } from '@prisma/adapter-pg';
import * as crypto from 'crypto';
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaClient } from '../prisma/generated/prisma/client';

const ALGORITHM = 'aes-256-gcm';

function deriveKey(rawKey: string): Buffer {
  return crypto.createHash('sha256').update(rawKey).digest();
}

function tryDecrypt(ciphertext: string, keyBuffer: Buffer): string | null {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) return null;

  const [ivHex, authTagHex, encryptedHex] = parts;
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    const result = decrypted.toString('utf8');
    if (result && !result.includes(':')) {
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

function encryptWithKey(plaintext: string, keyBuffer: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL no encontrada en .env');
    process.exit(1);
  }

  const currentKey =
    process.env.TWO_FACTOR_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    'fallback_insecure_key_for_development_only_12345';

  const currentKeyBuffer = deriveKey(currentKey);

  const candidateKeyNames = [
    'TWO_FACTOR_ENCRYPTION_KEY (.env)',
    'JWT_SECRET (.env)',
    'tu_clave_de_encriptacion_aes_256_de_32_bytes_para_2fa (.env.example)',
    'tu_super_secreto_jwt_para_tokens_de_acceso (.env.example)',
    'fallback_insecure_key_for_development_only_12345',
    'super_secret_jwt_key_change_in_production',
    'super_secret_two_factor_aes_256_key_change_in_production',
    'secret',
    'admin',
  ];

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const users = await prisma.user.findMany({
      include: {
        twoFactor: true,
      },
    });

    console.log(`\n=== Total Usuarios Registrados: ${users.length} ===`);
    for (const u of users) {
      console.log(`- Usuario: ${u.email} (ID: ${u.id})`);
      if (u.twoFactor) {
        console.log(`  2FA IsEnabled: ${u.twoFactor.isEnabled}`);
        console.log(`  2FA Secret (longitud): ${u.twoFactor.secret.length}`);

        // Probar con clave actual
        const decryptedCurrent = tryDecrypt(
          u.twoFactor.secret,
          currentKeyBuffer,
        );
        if (decryptedCurrent) {
          console.log(
            `  ✅ El secreto ya descifra correctamente con la clave actual.`,
          );
        } else {
          console.log(
            `  ❌ El secreto NO descifra con la clave actual (${currentKey.slice(0, 10)}...).`,
          );

          // Probar candidatos
          let foundKey = false;
          for (const cand of candidateKeyNames) {
            const candBuffer = deriveKey(cand);
            const decrypted = tryDecrypt(u.twoFactor.secret, candBuffer);
            if (decrypted) {
              console.log(
                `  🎉 ¡Descifrado con éxito usando la clave candidata: "${cand}"!`,
              );
              console.log(`  Re-encriptando con la clave actual...`);
              const reEncrypted = encryptWithKey(decrypted, currentKeyBuffer);
              await prisma.userTwoFactor.update({
                where: { id: u.twoFactor.id },
                data: { secret: reEncrypted },
              });
              console.log(
                `  ✅ Registro actualizado en base de datos con la clave actual.`,
              );
              foundKey = true;
              break;
            }
          }

          if (!foundKey) {
            console.log(`  ⚠️ No se encontró la clave original.`);
            const arg = process.argv[2];
            if (arg === '--reset') {
              console.log(`  Acción: Reseteando 2FA para ${u.email}...`);
              await prisma.userTwoFactor.update({
                where: { id: u.twoFactor.id },
                data: { isEnabled: false },
              });
              console.log(
                `  ✅ 2FA desactivado para ${u.email} (puede volver a enrolarse o entrar sin 2FA).`,
              );
            } else {
              console.log(
                `  Usa '--reset' para desactivar 2FA o reconfigurarlo limpiamente.`,
              );
            }
          }
        }
      } else {
        console.log(`  2FA: No configurado`);
      }
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
