import {
  SetMetadata,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import type { ApiKeyRecord } from '../interfaces/api-key.interface';

export const API_KEY_SCOPES_KEY = 'api_key_scopes';

/**
 * Decorador para restringir endpoints externos por scopes específicos de API Key.
 * @param scopes Lista de scopes necesarios (ej. 'students:read', 'grades:verify')
 */
export const RequireApiScope = (...scopes: string[]) =>
  SetMetadata(API_KEY_SCOPES_KEY, scopes);

/**
 * Decorador para inyectar la entidad ApiKey validada desde el request actual.
 */
export const CurrentApiKey = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): ApiKeyRecord | undefined => {
    const request = ctx.switchToHttp().getRequest<{ apiKey?: ApiKeyRecord }>();
    return request.apiKey;
  },
);
