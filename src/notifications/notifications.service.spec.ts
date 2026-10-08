import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationGateway } from './notifications.gateway';
import { firstValueFrom } from 'rxjs';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prismaMock: {
    user: { findUnique: jest.Mock };
    notification: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let gatewayMock: { sendToUser: jest.Mock };

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
      },
      notification: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'notif-1',
            ...data,
            createdAt: new Date(),
          }),
        ),
        findMany: jest.fn().mockResolvedValue([
          { id: 'notif-1', title: 'Test', isRead: false },
        ]),
        count: jest.fn().mockResolvedValue(1),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    gatewayMock = {
      sendToUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationGateway, useValue: gatewayMock },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('createNotification', () => {
    it('debe lanzar BadRequestException si no se provee userId ni email', async () => {
      await expect(
        service.createNotification({ title: 'Test', body: 'Body' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar NotFoundException si el usuario no existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.createNotification({
          userId: 'non-existent',
          title: 'A',
          body: 'B',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe crear notificación, emitir por gateway y emitir evento SSE', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'u-1' });

      const streamPromise = firstValueFrom(service.getStreamForUser('u-1'));

      const res = await service.createNotification({
        userId: 'u-1',
        title: 'Nueva alerta',
        body: 'Detalles del aviso',
      });

      expect(prismaMock.notification.create).toHaveBeenCalled();
      expect(gatewayMock.sendToUser).toHaveBeenCalledWith('u-1', res);

      const sseEvent = await streamPromise;
      expect(sseEvent.data).toEqual(res);
    });
  });

  describe('getUserNotifications', () => {
    it('debe paginar y calcular el total de páginas y no leídos', async () => {
      const result = await service.getUserNotifications('u-1', {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.unreadCount).toBe(1);
    });
  });

  describe('markAsRead y markAllAsRead', () => {
    it('debe marcar una notificación como leída', async () => {
      const res = await service.markAsRead('u-1', 'notif-1');
      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: 'u-1' },
        data: { isRead: true },
      });
      expect(res.success).toBe(true);
    });

    it('debe marcar todas como leídas', async () => {
      const res = await service.markAllAsRead('u-1');
      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u-1', isRead: false },
        data: { isRead: true },
      });
      expect(res.updatedCount).toBe(1);
    });
  });

  describe('getUnreadCount', () => {
    it('debe retornar el conteo de no leídos', async () => {
      prismaMock.notification.count.mockResolvedValue(5);
      const res = await service.getUnreadCount('u-1');
      expect(res.unreadCount).toBe(5);
    });
  });
});
