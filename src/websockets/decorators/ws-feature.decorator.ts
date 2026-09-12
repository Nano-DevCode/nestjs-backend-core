import { SetMetadata } from '@nestjs/common';
import { REQUIRE_FEATURE_KEY } from '../../features/decorators/require-feature.decorator';

/**
 * Restringe la invocación de un evento o Gateway de WebSocket únicamente si el
 * Feature Flag especificado está activo en el sistema.
 *
 * Validado por WsFeatureFlagGuard.
 *
 * @param featureKey Clave del Feature Flag (ej. 'REALTIME_NOTIFICATIONS', 'BETA_CHAT')
 *
 * @example
 * ```typescript
 * @SubscribeMessage('stream_analytics')
 * @WsRequireFeature('REALTIME_ANALYTICS')
 * handleStreamAnalytics() { ... }
 * ```
 */
export const WsRequireFeature = (featureKey: string) =>
  SetMetadata(REQUIRE_FEATURE_KEY, featureKey);
