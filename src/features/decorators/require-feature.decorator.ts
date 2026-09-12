import { SetMetadata } from '@nestjs/common';

export const REQUIRE_FEATURE_KEY = 'require_feature';

/**
 * Decorador para restringir el acceso a un controlador o ruta
 * únicamente si el Feature Flag correspondiente está habilitado.
 *
 * @param featureKey Identificador del Feature Flag (ej. 'BETA_FEATURE')
 */
export const RequireFeature = (featureKey: string) =>
  SetMetadata(REQUIRE_FEATURE_KEY, featureKey);
