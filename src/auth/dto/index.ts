export * from './register.dto';
export * from './login.dto';
export * from './verify-email.dto';
export * from './resend-verification.dto';

/**
 * NOTA DE ARQUITECTURA DE SEGURIDAD:
 * Los endpoints 'POST /auth/refresh' y 'POST /auth/logout' NO utilizan DTOs para el body.
 *
 * Justificación:
 * 1. El 'refresh_token' se transmite y valida exclusivamente a través de cookies seguras
 *    HttpOnly, SameSite=Strict y Path=/auth ('req.cookies.refresh_token'), mitigando
 *    completamente el acceso desde JavaScript y la exposición a vulnerabilidades XSS.
 * 2. La identidad del usuario en 'POST /auth/logout' se extrae de la sesión autenticada
 *    (vía 'AuthGuard('jwt')' en encabezado Authorization o cookie access_token).
 * 3. Aceptar payloads en el body para estos endpoints violaría el principio de mínimo privilegio
 *    y permitiría vectores de ataque donde clientes intenten inyectar tokens arbitrarios en el cuerpo.
 */
