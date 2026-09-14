import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { ApiKeysService } from './api-keys.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let prisma: {
    apiKey: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };

  const mockApiKeyRecord = {
    id: 'key-uuid-123',
    name: 'Partner Alpha',
    keyHash: 'dummy_hash',
    keyPrefix: 'ak_live_12345678',
    scopes: ['students:read', 'grades:verify'],
    rateLimit: 120,
    isActive: true,
    expiresAt: null,
    lastUsedAt: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      apiKey: {
        create: jest.fn().mockResolvedValue(mockApiKeyRecord),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([mockApiKeyRecord]),
        update: jest
          .fn()
          .mockResolvedValue({ ...mockApiKeyRecord, isActive: false }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateKey', () => {
    it('should generate a raw API key with ak_live_ prefix and store its SHA-256 hash', async () => {
      const dto = {
        name: 'Partner Alpha',
        scopes: ['students:read'],
        rateLimit: 60,
      };

      const result = await service.generateKey(dto);

      expect(result.key).toMatch(/^ak_live_[a-f0-9]{48}$/);
      expect(result.keyPrefix).toMatch(/^ak_live_[a-f0-9]{8}$/);
      expect(prisma.apiKey.create).toHaveBeenCalled();

      // Verificar que lo enviado a Prisma sea el hash SHA-256 y NO la clave en texto plano
      const createCall = prisma.apiKey.create.mock.calls[0]![0];
      expect(createCall.data.keyHash).not.toBe(result.key);
      expect(createCall.data.keyHash).toHaveLength(64); // Longitud de SHA-256 hex
    });
  });

  describe('validateKey', () => {
    it('should validate and return the API key if active and valid', async () => {
      const rawKey = 'ak_live_1234567890abcdef1234567890abcdef1234567890abcdef';
      const expectedHash = crypto
        .createHash('sha256')
        .update(rawKey)
        .digest('hex');

      prisma.apiKey.findUnique.mockResolvedValue({
        ...mockApiKeyRecord,
        keyHash: expectedHash,
      });

      const key = await service.validateKey(rawKey);

      expect(prisma.apiKey.findUnique).toHaveBeenCalledWith({
        where: { keyHash: expectedHash },
      });
      expect(key.id).toBe(mockApiKeyRecord.id);
    });

    it('should throw UnauthorizedException if format is invalid', async () => {
      await expect(service.validateKey('invalid_prefix_key')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if key is not found in database', async () => {
      prisma.apiKey.findUnique.mockResolvedValue(null);

      await expect(
        service.validateKey('ak_live_nonexistentkey1234567890abcdef'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if key is marked inactive (revoked)', async () => {
      prisma.apiKey.findUnique.mockResolvedValue({
        ...mockApiKeyRecord,
        isActive: false,
      });

      await expect(
        service.validateKey('ak_live_inactivekey1234567890abcdef'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if key has expired', async () => {
      const pastDate = new Date(Date.now() - 100000);
      prisma.apiKey.findUnique.mockResolvedValue({
        ...mockApiKeyRecord,
        expiresAt: pastDate,
      });

      await expect(
        service.validateKey('ak_live_expiredkey1234567890abcdef'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('listKeys and revokeKey', () => {
    it('should list keys', async () => {
      const keys = await service.listKeys();
      expect(keys).toHaveLength(1);
      expect(prisma.apiKey.findMany).toHaveBeenCalled();
    });

    it('should revoke an active key', async () => {
      const revoked = await service.revokeKey('key-uuid-123');
      expect(revoked.isActive).toBe(false);
      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-uuid-123' },
        data: { isActive: false },
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException if key to revoke does not exist', async () => {
      prisma.apiKey.update.mockRejectedValue(new Error('Record not found'));
      await expect(service.revokeKey('unknown-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
