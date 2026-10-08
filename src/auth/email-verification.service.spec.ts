import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EmailVerificationService } from './email-verification.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { REDIS_CLIENT } from '../redis/redis.constants';

describe('EmailVerificationService', () => {
  let service: EmailVerificationService;
  let prismaMock: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let mailServiceMock: {
    sendVerificationEmail: jest.Mock;
  };
  let redisMock: {
    pipeline: jest.Mock;
    getdel: jest.Mock;
    del: jest.Mock;
  };
  let pipelineMock: {
    set: jest.Mock;
    exec: jest.Mock;
  };

  beforeEach(async () => {
    pipelineMock = {
      set: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };

    redisMock = {
      pipeline: jest.fn().mockReturnValue(pipelineMock),
      getdel: jest.fn(),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
    };

    prismaMock = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    mailServiceMock = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailVerificationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: MailService, useValue: mailServiceMock },
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    service = module.get<EmailVerificationService>(EmailVerificationService);
  });

  describe('generateAndSendToken', () => {
    it('debe generar token, persistir en Redis y enviar correo electrónico', async () => {
      await service.generateAndSendToken({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Tester',
      });

      expect(redisMock.pipeline).toHaveBeenCalled();
      expect(pipelineMock.set).toHaveBeenCalledTimes(2);
      expect(mailServiceMock.sendVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          name: 'Tester',
          verificationToken: expect.any(String),
        }),
      );
    });
  });

  describe('verifyEmail', () => {
    it('debe lanzar BadRequestException si el token no existe en Redis o expiró', async () => {
      redisMock.getdel.mockResolvedValue(null);

      await expect(service.verifyEmail('invalid-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar BadRequestException si el usuario no está activo o fue borrado', async () => {
      redisMock.getdel.mockResolvedValue('user-123');
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-123',
        isActive: false,
        deletedAt: new Date(),
      });

      await expect(service.verifyEmail('valid-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe marcar emailVerifiedAt y retornar mensaje satisfactorio', async () => {
      redisMock.getdel.mockResolvedValue('user-123');
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-123',
        isActive: true,
        deletedAt: null,
      });

      const res = await service.verifyEmail('valid-token');

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { emailVerifiedAt: expect.any(Date) },
      });
      expect(redisMock.del).toHaveBeenCalledWith('auth:user-verify-token:user-123');
      expect(res.message).toBeDefined();
    });
  });

  describe('resendVerificationEmail', () => {
    it('debe retornar mensaje genérico si el usuario no existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const res = await service.resendVerificationEmail('missing@example.com');
      expect(res.message).toContain('Si la cuenta existe');
      expect(mailServiceMock.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('debe retornar mensaje genérico si el usuario ya estaba verificado', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'verified@example.com',
        isActive: true,
        deletedAt: null,
        emailVerifiedAt: new Date(),
      });

      const res = await service.resendVerificationEmail('verified@example.com');
      expect(res.message).toContain('Si la cuenta existe');
      expect(mailServiceMock.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('debe reenviar email si la cuenta existe y no está verificada', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'unverified@example.com',
        isActive: true,
        deletedAt: null,
        emailVerifiedAt: null,
      });

      const res = await service.resendVerificationEmail('unverified@example.com');
      expect(res.message).toContain('Si la cuenta existe');
      expect(mailServiceMock.sendVerificationEmail).toHaveBeenCalled();
    });
  });
});
