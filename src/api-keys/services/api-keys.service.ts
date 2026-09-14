import {
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { ApiKeyRecord } from '../interfaces/api-key.interface';
import { CreateApiKeyDto } from '../dto/api-key.dto';

export interface GeneratedApiKeyResponse {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  scopes: string[];
  rateLimit: number;
  expiresAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Genera una nueva API Key criptográfica con prefijo ak_live_...,
   * persistiendo exclusivamente su hash SHA-256 en la base de datos.
   * La clave en texto plano SOLO se entrega en este método.
   */
  async generateKey(dto: CreateApiKeyDto): Promise<GeneratedApiKeyResponse> {
    // 1. Generación de bytes aleatorios de alta entropía (24 bytes = 48 caracteres hexadecimales)
    const randomHex = crypto.randomBytes(24).toString('hex');
    const keyPrefix = `ak_live_${randomHex.slice(0, 8)}`;
    const rawKey = `ak_live_${randomHex}`;

    // 2. Cálculo del hash SHA-256 para almacenamiento seguro
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    // 3. Persistir entidad en PostgreSQL vía Prisma
    const record = await this.prisma.apiKey.create({
      data: {
        name: dto.name,
        keyHash,
        keyPrefix,
        scopes: dto.scopes || [],
        rateLimit: dto.rateLimit || 60,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        isActive: true,
      },
    });

    this.logger.log(
      `API Key generada exitosamente: ${record.id} [${keyPrefix}] para "${dto.name}"`,
    );

    return {
      id: record.id,
      name: record.name,
      key: rawKey,
      keyPrefix: record.keyPrefix,
      scopes: record.scopes,
      rateLimit: record.rateLimit,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    };
  }

  /**
   * Valida una API Key en texto plano verificando su hash SHA-256,
   * estado activo, vigencia temporal y actualiza asíncronamente su lastUsedAt.
   */
  async validateKey(rawKey: string): Promise<ApiKeyRecord> {
    if (!rawKey || typeof rawKey !== 'string') {
      throw new UnauthorizedException(
        'API key no proporcionada o con formato inválido',
      );
    }

    const trimmedKey = rawKey.trim();
    if (!trimmedKey.startsWith('ak_live_')) {
      throw new UnauthorizedException(
        'Formato de API key no reconocido (se esperaba prefijo ak_live_...)',
      );
    }

    // 1. Calcular hash SHA-256 de la clave recibida
    const keyHash = crypto
      .createHash('sha256')
      .update(trimmedKey)
      .digest('hex');

    // 2. Buscar en base de datos
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
    });

    if (!apiKey) {
      throw new UnauthorizedException('API key no válida o inexistente');
    }

    // 3. Validar estado activo
    if (!apiKey.isActive) {
      throw new UnauthorizedException(
        'La API key se encuentra inactiva o ha sido revocada',
      );
    }

    // 4. Validar fecha de expiración
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new UnauthorizedException('La API key ha expirado');
    }

    // 5. Actualizar última fecha de uso en segundo plano (fire & forget para no bloquear latencia)
    this.prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      })
      .catch((err) => {
        this.logger.warn(
          `No se pudo actualizar lastUsedAt para key ${apiKey.id}: ${(err as Error).message}`,
        );
      });

    return apiKey;
  }

  /**
   * Lista todas las API Keys registradas omitiendo el hash sensible.
   */
  async listKeys() {
    return this.prisma.apiKey.findMany({
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        rateLimit: true,
        isActive: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Revoca inmediatamente una API Key cambiando su estatus a inactivo.
   */
  async revokeKey(id: string) {
    try {
      const updated = await this.prisma.apiKey.update({
        where: { id },
        data: { isActive: false },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          isActive: true,
        },
      });

      this.logger.log(
        `API Key revocada exitosamente: ${id} [${updated.keyPrefix}]`,
      );
      return updated;
    } catch {
      throw new NotFoundException(`API Key con ID '${id}' no encontrada`);
    }
  }
}
