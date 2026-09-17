import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationGateway } from './notifications.gateway';
import type { Prisma } from '../../prisma/generated/prisma/client';
import type {
  CreateNotificationDto,
  NotificationQueryDto,
} from './dto/notification.dto';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export interface SseNotificationEvent {
  userId: string;
  data: unknown;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly sseSubject = new Subject<SseNotificationEvent>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async createNotification(dto: CreateNotificationDto) {
    let targetUserId = dto.userId;

    if (!targetUserId && dto.email) {
      const targetUser = await this.prisma.user.findUnique({
        where: { email: dto.email.toLowerCase().trim() },
        select: { id: true },
      });
      if (!targetUser) {
        throw new NotFoundException(
          `Usuario con correo '${dto.email}' no encontrado en el sistema.`,
        );
      }
      targetUserId = targetUser.id;
    }

    if (!targetUserId) {
      throw new BadRequestException(
        'Debes proporcionar al menos el userId o el email del destinatario.',
      );
    }

    if (dto.userId) {
      const exists = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true },
      });
      if (!exists) {
        throw new NotFoundException(
          `Usuario con ID '${targetUserId}' no encontrado en el sistema.`,
        );
      }
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId: targetUserId,
        title: dto.title,
        body: dto.body,
        type: dto.type || 'INFO',
        data: dto.data ? (dto.data as Prisma.InputJsonValue) : undefined,
      },
    });

    // 1. Despacho en tiempo real vía WebSocket
    this.notificationGateway.sendToUser(targetUserId, notification);

    // 2. Despacho en tiempo real vía SSE Stream
    this.sseSubject.next({
      userId: targetUserId,
      data: notification,
    });

    return notification;
  }

  async getUserNotifications(userId: string, query: NotificationQueryDto) {
    const { page = 1, limit = 20, isRead, unreadOnly } = query;
    const skip = (page - 1) * limit;

    const effectiveIsRead = unreadOnly ? false : isRead;

    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(typeof effectiveIsRead === 'boolean'
        ? { isRead: effectiveIsRead }
        : {}),
    };

    const [data, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      unreadCount,
    };
  }

  async markAsRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
    return { success: true, message: 'Notificación marcada como leída' };
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return {
      success: true,
      updatedCount: result.count,
      message: 'Todas las notificaciones marcadas como leídas',
    };
  }

  async getUnreadCount(userId: string) {
    const unreadCount = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { unreadCount };
  }

  getStreamForUser(userId: string): Observable<{ data: unknown }> {
    return this.sseSubject.asObservable().pipe(
      filter((event) => event.userId === userId),
      map((event) => ({ data: event.data })),
    );
  }
}
