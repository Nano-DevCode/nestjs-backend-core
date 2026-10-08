import { MobileConfigService } from './mobile-config.service';
import { MobilePlatform } from '../dto/version-check.dto';

describe('MobileConfigService', () => {
  let service: MobileConfigService;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.MOBILE_MIN_VERSION_ANDROID = '1.2.0';
    process.env.MOBILE_LATEST_VERSION_ANDROID = '1.5.0';
    process.env.MOBILE_MIN_VERSION_IOS = '1.0.0';
    process.env.MOBILE_LATEST_VERSION_IOS = '1.3.0';
    service = new MobileConfigService();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('checkVersion', () => {
    it('debe exigir actualización obligatoria (forceUpdate) si la versión actual es menor a minVersion', () => {
      const result = service.checkVersion(MobilePlatform.ANDROID, '1.1.0');

      expect(result.forceUpdate).toBe(true);
      expect(result.recommendUpdate).toBe(false);
      expect(result.minVersion).toBe('1.2.0');
    });

    it('debe recomendar actualización (recommendUpdate) si la versión es menor a latestVersion pero mayor o igual a minVersion', () => {
      const result = service.checkVersion(MobilePlatform.ANDROID, '1.3.0');

      expect(result.forceUpdate).toBe(false);
      expect(result.recommendUpdate).toBe(true);
      expect(result.latestVersion).toBe('1.5.0');
    });

    it('no debe requerir actualización si la versión instalada es igual o mayor a latestVersion', () => {
      const result = service.checkVersion(MobilePlatform.ANDROID, '1.5.0');

      expect(result.forceUpdate).toBe(false);
      expect(result.recommendUpdate).toBe(false);
    });

    it('debe resolver URLs y configuraciones para la plataforma iOS correctamente', () => {
      const result = service.checkVersion(MobilePlatform.IOS, '1.0.0');

      expect(result.platform).toBe(MobilePlatform.IOS);
      expect(result.forceUpdate).toBe(false);
      expect(result.recommendUpdate).toBe(true);
      expect(result.minVersion).toBe('1.0.0');
    });

    it('debe reflejar el modo de mantenimiento cuando MOBILE_MAINTENANCE_MODE es true', () => {
      process.env.MOBILE_MAINTENANCE_MODE = 'true';
      const result = service.checkVersion(MobilePlatform.ANDROID, '2.0.0');

      expect(result.maintenanceMode).toBe(true);
    });
  });

  describe('getAppConfig', () => {
    it('debe retornar la metadata y configuración para la aplicación móvil', () => {
      const config = service.getAppConfig();

      expect(config).toHaveProperty('appName');
      expect(config).toHaveProperty('supportEmail');
      expect(config).toHaveProperty('termsUrl');
      expect(config).toHaveProperty('privacyPolicyUrl');
      expect(config).toHaveProperty('apiBaseUrl');
      expect(config.maxUploadSizeMb).toBe(5);
    });
  });
});

