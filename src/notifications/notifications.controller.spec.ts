import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import type { UserAuthContext } from '../auth/interfaces/auth.interface';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: {
    getUserNotifications: jest.Mock;
    getUnreadCount: jest.Mock;
    markAsRead: jest.Mock;
    markAllAsRead: jest.Mock;
    getStreamForUser: jest.Mock;
    createNotification: jest.Mock;
  };

  const mockUser: UserAuthContext = {
    id: 'user-uuid-1',
    email: 'test@example.com',
    roles: ['user'],
    permissions: [],
    isTwoFactorEnabled: false,
  };

  beforeEach(async () => {
    service = {
      getUserNotifications: jest.fn().mockResolvedValue({
        data: [],
        total: 0,
        unreadCount: 0,
        page: 1,
        limit: 20,
      }),
      getUnreadCount: jest.fn().mockResolvedValue({ unreadCount: 5 }),
      markAsRead: jest.fn().mockResolvedValue({ id: 'notif-1', isRead: true }),
      markAllAsRead: jest.fn().mockResolvedValue({ count: 3 }),
      getStreamForUser: jest
        .fn()
        .mockReturnValue(of({ data: { type: 'CONNECTED' } })),
      createNotification: jest.fn().mockResolvedValue({
        id: 'notif-new',
        userId: 'target-user-1',
        title: 'Título de prueba',
        body: 'Cuerpo de prueba',
        type: 'INFO',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('list', () => {
    it('should call getUserNotifications with user id and query', async () => {
      const query = { page: 1, limit: 10, unreadOnly: true };
      const res = await controller.list(mockUser, query);

      expect(service.getUserNotifications).toHaveBeenCalledWith(
        mockUser.id,
        query,
      );
      expect(res).toHaveProperty('data');
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread notification count for user', async () => {
      const res = await controller.getUnreadCount(mockUser);
      expect(service.getUnreadCount).toHaveBeenCalledWith(mockUser.id);
      expect(res).toEqual({ unreadCount: 5 });
    });
  });

  describe('markAsRead', () => {
    it('should mark specific notification as read', async () => {
      const res = await controller.markAsRead(mockUser, 'notif-1');
      expect(service.markAsRead).toHaveBeenCalledWith(mockUser.id, 'notif-1');
      expect(res).toEqual({ id: 'notif-1', isRead: true });
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', async () => {
      const res = await controller.markAllAsRead(mockUser);
      expect(service.markAllAsRead).toHaveBeenCalledWith(mockUser.id);
      expect(res).toEqual({ count: 3 });
    });
  });

  describe('streamNotifications', () => {
    it('should return an observable stream for user notifications', (done) => {
      const stream$ = controller.streamNotifications(mockUser);
      expect(service.getStreamForUser).toHaveBeenCalledWith(mockUser.id);

      stream$.subscribe({
        next: (event) => {
          expect(event).toEqual({ data: { type: 'CONNECTED' } });
          done();
        },
      });
    });
  });

  describe('createNotification', () => {
    it('should call notificationsService.createNotification with dto', async () => {
      const dto = {
        userId: 'target-user-1',
        title: 'Título de prueba',
        body: 'Cuerpo de prueba',
      };
      const res = await controller.createNotification(dto);
      expect(service.createNotification).toHaveBeenCalledWith(dto);
      expect(res).toEqual({
        id: 'notif-new',
        userId: 'target-user-1',
        title: 'Título de prueba',
        body: 'Cuerpo de prueba',
        type: 'INFO',
      });
    });
  });

  describe('sendNotification', () => {
    it('should call notificationsService.createNotification with dto', async () => {
      const dto = {
        userId: 'target-user-1',
        title: 'Aviso de Pago Pendiente',
        body: 'Hola Juan, recuerda tu fecha límite',
        type: 'WARNING',
      };
      const res = await controller.sendNotification(dto);
      expect(service.createNotification).toHaveBeenCalledWith(dto);
      expect(res).toBeDefined();
    });
  });
});

