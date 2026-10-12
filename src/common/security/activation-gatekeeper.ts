import * as crypto from 'crypto';

/**
 * Hash criptográfico SHA-256 de la llave maestra de activación autorizada.
 * Generada y custodiada exclusivamente por Manuel Eduardo Santiago Feria (Nano-DevCode).
 */
export const AUTHORIZED_ACTIVATION_HASH =
  '93562618f98070b3bb6c82f8b74d6a2cbab08260a588e1014fe1164ca6b34a1e';

export interface GatekeeperResult {
  allowed: boolean;
  reason?: 'ALLOWED' | 'TEST_MODE' | 'MISSING_KEY' | 'INVALID_KEY';
}

/**
 * Valida si la instancia actual cuenta con una llave de activación válida y autorizada.
 * Si el entorno es 'test', se permite la ejecución para suites de prueba automatizadas.
 */
export function verifyActivationKey(
  key?: string,
  env: string = process.env.NODE_ENV || 'development',
): GatekeeperResult {
  if (env === 'test') {
    return { allowed: true, reason: 'TEST_MODE' };
  }

  if (!key || typeof key !== 'string' || key.trim() === '') {
    return {
      allowed: false,
      reason: 'MISSING_KEY',
    };
  }

  const computedHash = crypto
    .createHash('sha256')
    .update(key.trim())
    .digest('hex');

  // Comparación en tiempo constante para mitigar ataques de temporización (timing attacks)
  const isMatch =
    computedHash.length === AUTHORIZED_ACTIVATION_HASH.length &&
    crypto.timingSafeEqual(
      Buffer.from(computedHash, 'utf-8'),
      Buffer.from(AUTHORIZED_ACTIVATION_HASH, 'utf-8'),
    );

  if (!isMatch) {
    return {
      allowed: false,
      reason: 'INVALID_KEY',
    };
  }

  return { allowed: true, reason: 'ALLOWED' };
}

/**
 * Ejecuta el control de acceso de arranque (bootstrap).
 * Si la llave no es válida o no fue provista, detiene el proceso de inmediato.
 */
export function enforceActivationGatekeeper(): void {
  const env = process.env.NODE_ENV || 'development';
  const key = process.env.SYSTEM_ACTIVATION_KEY;

  const result = verifyActivationKey(key, env);

  if (!result.allowed) {
    console.error(
      '\x1b[31m%s\x1b[0m',
      '════════════════════════════════════════════════════════════════════════════════',
    );
    console.error(
      '\x1b[31m%s\x1b[0m',
      '⛔ ERROR CRÍTICO: INSTANCIA DE SOFTWARE NO LICENCIADA / BLOQUEO DE ACTIVACIÓN ⛔',
    );
    console.error(
      '\x1b[31m%s\x1b[0m',
      '════════════════════════════════════════════════════════════════════════════════',
    );
    console.error(
      '\x1b[33m%s\x1b[0m',
      'Este software y su arquitectura modular son propiedad intelectual exclusiva de:',
    );
    console.error(
      '\x1b[37m%s\x1b[0m',
      '  Manuel Eduardo Santiago Feria (Nano-DevCode)',
    );
    console.error('');
    console.error(
      '\x1b[33m%s\x1b[0m',
      'AVISO DE PROTECCIÓN DE CÓDIGO PROPIETARIO:',
    );
    console.error(
      '\x1b[90m%s\x1b[0m',
      '  El acceso al código fuente en repositorios públicos es exclusivamente con fines',
    );
    console.error(
      '\x1b[90m%s\x1b[0m',
      '  de exhibición técnica, inspección de arquitectura y evaluación de portafolio.',
    );
    console.error(
      '\x1b[90m%s\x1b[0m',
      '  Queda terminantemente prohibida su ejecución, copia, clonación o despliegue',
    );
    console.error(
      '\x1b[90m%s\x1b[0m',
      '  sin la correspondiente llave de activación autorizada por el autor.',
    );
    console.error('');
    console.error(
      '\x1b[36m%s\x1b[0m',
      'Para solicitar una licencia de uso o activación comercial, contacte a:',
    );
    console.error('\x1b[32m%s\x1b[0m', '  📧 Correo: mayka708.ms@gmail.com');
    console.error(
      '\x1b[32m%s\x1b[0m',
      '  🌐 GitHub: https://github.com/Nano-DevCode',
    );
    console.error(
      '\x1b[31m%s\x1b[0m',
      '════════════════════════════════════════════════════════════════════════════════',
    );

    process.exit(1);
  }
}
