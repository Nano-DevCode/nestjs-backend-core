import { SetMetadata } from '@nestjs/common';
import { REQUIRE_2FA_KEY } from '../../two-factor/decorators/require-2fa.decorator';

/**
 * Exige autenticación en dos pasos (Step-Up 2FA) para eventos WebSocket críticos.
 *
 * El usuario autenticado debe proveer su código TOTP de 6 dígitos en:
 * - El header de conexión `x-2fa-code`
 * - O en el payload del evento (`code`, `totpCode`, `twoFactorCode`)
 *
 * Validado por WsTwoFactorGuard.
 *
 * @example
 * ```typescript
 * @SubscribeMessage('delete_database_snapshot')
 * @WsRequire2FA()
 * handleSnapshotDeletion() { ... }
 * ```
 */
export const WsRequire2FA = () => SetMetadata(REQUIRE_2FA_KEY, true);
export const WsStepUp = WsRequire2FA;
