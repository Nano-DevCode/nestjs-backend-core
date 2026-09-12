import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditMetadata } from '../common/decorators/audit-context.decorator';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: {
    auditLog: {
      create: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-log-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should persist audit log with correct metadata and details', async () => {
    const context: AuditMetadata = {
      userId: 'usr-999',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      method: 'PATCH',
      endpoint: '/users/usr-123',
    };

    await service.log({
      context,
      action: 'UPDATE_USER',
      entity: 'users',
      entityId: 'usr-123',
      details: { name: 'New Name' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'usr-999',
        action: 'UPDATE_USER',
        entity: 'users',
        entityId: 'usr-123',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        method: 'PATCH',
        endpoint: '/users/usr-123',
        details: { name: 'New Name' },
      },
    });
  });

  it('should catch database errors gracefully and not throw', async () => {
    prisma.auditLog.create.mockRejectedValueOnce(
      new Error('DB Connection Timeout'),
    );

    const context: AuditMetadata = {
      ipAddress: '10.0.0.1',
      method: 'DELETE',
      endpoint: '/files/file.png',
    };

    await expect(
      service.log({
        context,
        action: 'DELETE_FILE',
        entity: 'files',
        entityId: 'file.png',
      }),
    ).resolves.not.toThrow();
  });

  it('should redact sensitive fields such as password and token in details', async () => {
    const context: AuditMetadata = {
      userId: 'usr-123',
      ipAddress: '127.0.0.1',
      method: 'POST',
      endpoint: '/auth/login',
    };

    await service.log({
      context,
      action: 'USER_LOGIN',
      details: {
        email: 'test@example.com',
        password: 'SuperSecretPassword123!',
        token: 'eyJh.sensitive.token',
        nested: {
          refreshToken: 'refresh-abc',
          safeField: 'visible',
        },
      },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        details: {
          email: 'test@example.com',
          password: '[REDACTED]',
          token: '[REDACTED]',
          nested: {
            refreshToken: '[REDACTED]',
            safeField: 'visible',
          },
        },
      }),
    });
  });
});
