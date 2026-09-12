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
          details: details ? (details as Prisma.InputJsonValue) : undefined,
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
