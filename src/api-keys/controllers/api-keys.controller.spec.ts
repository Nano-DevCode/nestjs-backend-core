import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from '../services/api-keys.service';
import { Reflector } from '@nestjs/core';

describe('ApiKeysController', () => {
  let controller: ApiKeysController;
  let serviceMock: {
    generateKey: jest.Mock;
    listKeys: jest.Mock;
    revokeKey: jest.Mock;
  };

  beforeEach(async () => {
    serviceMock = {
      generateKey: jest.fn().mockResolvedValue({
        id: 'key-1',
        apiKey: 'sk_live_12345',
        name: 'Partner A',
      }),
      listKeys: jest.fn().mockResolvedValue([
        { id: 'key-1', name: 'Partner A', keyPrefix: 'sk_live_...' },
      ]),
      revokeKey: jest.fn().mockResolvedValue({ message: 'Key revocada' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeysController],
      providers: [
        { provide: ApiKeysService, useValue: serviceMock },
        { provide: Reflector, useValue: {} },
      ],
    }).compile();

    controller = module.get<ApiKeysController>(ApiKeysController);
  });

  describe('createKey', () => {
    it('debe generar una clave API llamando al servicio', async () => {
      const dto = { name: 'Partner A', scopes: ['read'] };
      const res = await controller.createKey(dto);

      expect(serviceMock.generateKey).toHaveBeenCalledWith(dto);
      expect(res.apiKey).toBe('sk_live_12345');
    });
  });

  describe('listKeys', () => {
    it('debe listar las claves existentes', async () => {
      const res = await controller.listKeys();
      expect(serviceMock.listKeys).toHaveBeenCalled();
      expect(res).toHaveLength(1);
    });
  });

  describe('revokeKey', () => {
    it('debe revocar la clave llamando al servicio', async () => {
      const res = await controller.revokeKey('key-1');
      expect(serviceMock.revokeKey).toHaveBeenCalledWith('key-1');
      expect(res.message).toBeDefined();
    });
  });
});

