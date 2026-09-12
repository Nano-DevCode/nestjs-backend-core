import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditMetadata } from '../common/decorators/audit-context.decorator';
import type { Prisma } from '../../prisma/generated/prisma/client';

export interface AuditLogParams {
  context: AuditMetadata;
  action: string;
  entity?: string;
  entityId?: string;
  details?: Record<string, any>;
}

const SENSITIVE_KEY_PATTERN =
  /^(password|passwordhash|token|refreshtoken|accesstoken|secret|credit_?card|cvv|authorization|apikey|api_key|twofactorsecret|encryptionkey)$/i;

/**
 * Sanitiza recursivamente objetos y arrays para rediseñar y ocultar
 * información confidencial (credenciales, tokens, llaves criptográficas)
 * antes de almacenar en el log de auditoría.
 */
export function redactSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item));
  }

  if (typeof data === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      data as Record<string, unknown>,
    )) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactSensitiveData(value);
      }
    }
    return redacted;
  }

  return data;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    context: AuditMetadata;
    action: string;
    entity?: string;
    entityId?: string;
    details?: Record<string, any>;
  }): Promise<void> {
    const { context, action, entity, entityId, details } = params;
    const sanitizedDetails = details
      ? (redactSensitiveData(details) as Prisma.InputJsonValue)
      : undefined;

    try {
      await this.prisma.auditLog.create({
        data: {
          userId: context.userId ?? null,
          action,
          entity: entity ?? null,
          entityId: entityId ?? null,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent ?? null,
          method: context.method,
          endpoint: context.endpoint,
          details: sanitizedDetails,
        },
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error al persistir log de auditoría [${action}]: ${err.message}`,
        err.stack,
      );
    }
  }
}
