import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeysService } from '../services/api-keys.service';
import { API_KEY_SCOPES_KEY } from '../decorators/api-key.decorator';
import type { ApiKeyRecord } from '../interfaces/api-key.interface';

interface RequestWithApiKey {
  headers: Record<string, string | string[] | undefined>;
  apiKey?: ApiKeyRecord;
}

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithApiKey>();

    // 1. Extraer cabecera X-API-Key (insensible a mayúsculas/minúsculas en Express)
    const headerValue =
      request.headers['x-api-key'] || request.headers['X-API-KEY'];

    const rawKey = typeof headerValue === 'string' ? headerValue : undefined;

    if (!rawKey) {
      throw new UnauthorizedException(
        'Cabecera X-API-Key no proporcionada en la petición externa',
      );
    }

    // 2. Validar autenticidad, vigencia y estatus activo de la API key
    const apiKey: ApiKeyRecord = await this.apiKeysService.validateKey(rawKey);

    // Inyectar en el objeto request para disponibilidad en controladores
    request.apiKey = apiKey;

    // 3. Inspeccionar scopes requeridos por el endpoint o controlador
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(
      API_KEY_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    // 4. Verificar que la API Key posea todos los scopes requeridos
    const keyScopes = new Set(apiKey.scopes);
    const missingScopes = requiredScopes.filter(
      (scope) => !keyScopes.has(scope),
    );

    if (missingScopes.length > 0) {
      throw new ForbiddenException(
        `Permisos insuficientes. La API Key no cuenta con los scopes requeridos: [${missingScopes.join(', ')}]`,
      );
    }

    return true;
  }
}
