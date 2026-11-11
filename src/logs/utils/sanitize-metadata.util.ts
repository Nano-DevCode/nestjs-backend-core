const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /currentpassword/i,
  /newpassword/i,
  /confirmpassword/i,
  /token/i,
  /accesstoken/i,
  /refreshtoken/i,
  /authorization/i,
  /secret/i,
  /creditcard/i,
  /cardnumber/i,
  /cvv/i,
  /apikey/i,
  /keyhash/i,
  /cookie/i,
];

export const REDACTED_VALUE = '***REDACTED***';

/**
 * Enmascara recursivamente cualquier valor sensible en el objeto metadata
 * protegiendo contra credenciales, tokens y referencias circulares.
 */
export function sanitizeMetadata(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    // Sanitizar cadenas que contengan patrones evidentes de tokens/passwords
    if (/Bearer\s+[A-Za-z0-9\-._~+/]+=*/i.test(value)) {
      return value.replace(
        /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
        `Bearer ${REDACTED_VALUE}`,
      );
    }
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  // Prevenir desbordamiento de pila por referencias circulares
  if (seen.has(value)) {
    return '[Circular Reference]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadata(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) =>
      pattern.test(key),
    );

    if (isSensitive) {
      result[key] = REDACTED_VALUE;
    } else {
      result[key] = sanitizeMetadata(val, seen);
    }
  }

  return result;
}
