import { Test, TestingModule } from '@nestjs/testing';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';
import { Reflector } from '@nestjs/core';

describe('FeatureFlagsController', () => {
  let controller: FeatureFlagsController;
  let serviceMock: {
    isFeatureEnabled: jest.Mock;
    getAllFlags: jest.Mock;
    setFeatureFlag: jest.Mock;
  };

  beforeEach(async () => {
    serviceMock = {
      isFeatureEnabled: jest.fn().mockImplementation((key) => {
        if (key === 'oauth_social_login') return Promise.resolve(true);
        if (key === 'oauth_google') return Promise.resolve(true);
        if (key === 'oauth_facebook') return Promise.resolve(false);
        if (key === 'DISCORD_BOT_ENABLED') return Promise.resolve(true);
        return Promise.resolve(false);
      }),
      getAllFlags: jest.fn().mockResolvedValue([
        { key: 'oauth_social_login', isEnabled: true },
      ]),
      setFeatureFlag: jest.fn().mockResolvedValue({ key: 'test_flag', isEnabled: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeatureFlagsController],
      providers: [
        { provide: FeatureFlagsService, useValue: serviceMock },
        { provide: Reflector, useValue: {} },
      ],
    }).compile();

    controller = module.get<FeatureFlagsController>(FeatureFlagsController);
  });

  describe('getPublicFlags', () => {
    it('debe calcular las banderas públicas para el frontend', async () => {
      const publicFlags = await controller.getPublicFlags();

      expect(publicFlags).toEqual({
        oauth_social_login: true,
        oauth_google: true,
        oauth_facebook: false,
        discord_bot: true,
      });
    });
  });

  describe('getAllFlags', () => {
    it('debe listar todas las banderas disponibles', async () => {
      const flags = await controller.getAllFlags();
      expect(flags).toHaveLength(1);
      expect(serviceMock.getAllFlags).toHaveBeenCalled();
    });
  });

  describe('toggleFlag', () => {
    it('debe actualizar la bandera llamando al servicio', async () => {
      const res = await controller.toggleFlag('test_flag', { isEnabled: true });
      expect(serviceMock.setFeatureFlag).toHaveBeenCalledWith(
        'test_flag',
        true,
        undefined,
        undefined,
      );
      expect(res.key).toBe('test_flag');
    });
  });
});
