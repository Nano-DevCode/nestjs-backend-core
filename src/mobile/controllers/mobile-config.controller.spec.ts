import { Test, TestingModule } from '@nestjs/testing';
import { MobileConfigController } from './mobile-config.controller';
import { MobileConfigService } from '../services/mobile-config.service';
import { MobilePlatform } from '../dto/version-check.dto';

describe('MobileConfigController', () => {
  let controller: MobileConfigController;
  let service: MobileConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MobileConfigController],
      providers: [MobileConfigService],
    }).compile();

    controller = module.get<MobileConfigController>(MobileConfigController);
    service = module.get<MobileConfigService>(MobileConfigService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });

  describe('checkVersion', () => {
    it('should default to android and 1.0.0 when no params or headers are provided', () => {
      const result = controller.checkVersion({});
      expect(result.platform).toBe(MobilePlatform.ANDROID);
      expect(result.currentVersion).toBe('1.0.0');
    });

    it('should honor query params for platform and version', () => {
      const result = controller.checkVersion({
        platform: MobilePlatform.IOS,
        currentVersion: '0.9.0',
      });
      expect(result.platform).toBe(MobilePlatform.IOS);
      expect(result.currentVersion).toBe('0.9.0');
      expect(result.forceUpdate).toBe(true);
    });

    it('should read platform and version from headers if query params are missing', () => {
      const result = controller.checkVersion({}, 'ios', '1.1.0');
      expect(result.platform).toBe(MobilePlatform.IOS);
      expect(result.currentVersion).toBe('1.1.0');
    });

    it('should indicate forceUpdate=false and recommendUpdate=true when version is between min and latest', () => {
      const result = controller.checkVersion({
        platform: MobilePlatform.ANDROID,
        currentVersion: '1.1.0',
      });
      expect(result.forceUpdate).toBe(false);
      expect(result.recommendUpdate).toBe(true);
    });

    it('should indicate forceUpdate=false and recommendUpdate=false when version is up to date', () => {
      const result = controller.checkVersion({
        platform: MobilePlatform.ANDROID,
        currentVersion: '2.0.0',
      });
      expect(result.forceUpdate).toBe(false);
      expect(result.recommendUpdate).toBe(false);
    });
  });

  describe('getAppConfig', () => {
    it('should return app public configuration', () => {
      const config = controller.getAppConfig();
      expect(config).toHaveProperty('appName');
      expect(config).toHaveProperty('supportEmail');
      expect(config).toHaveProperty('apiBaseUrl');
      expect(config).toHaveProperty('realtimeNamespace');
      expect(config).toHaveProperty('maxUploadSizeMb');
    });
  });
});
