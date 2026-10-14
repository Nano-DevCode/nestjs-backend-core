import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../prisma/generated/prisma/client';
import { QueryAuditsDto } from './dto/query-audits.dto';

@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryAuditsDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;
    const take = limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (query.action?.trim()) {
      where.action = { contains: query.action.trim(), mode: 'insensitive' };
    }

    if (query.entity?.trim()) {
      where.entity = { contains: query.entity.trim(), mode: 'insensitive' };
    }

    if (query.entityId?.trim()) {
      where.entityId = query.entityId.trim();
    }

    if (query.userId?.trim()) {
      where.userId = query.userId.trim();
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { action: { contains: term, mode: 'insensitive' } },
        { endpoint: { contains: term, mode: 'insensitive' } },
        { ipAddress: { contains: term, mode: 'insensitive' } },
        { entity: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    const [total, audits] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          method: true,
          endpoint: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          details: true,
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    return {
      audits,
      total,
      totalPages,
      page,
      limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  async findById(id: string) {
    const audit = await this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!audit) {
      throw new NotFoundException(
        `No se encontró el registro de auditoría con ID "${id}"`,
      );
    }

    return audit;
  }
}
