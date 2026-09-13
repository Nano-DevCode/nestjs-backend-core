import { Injectable } from '@nestjs/common';
import { MobilePlatform } from '../dto/version-check.dto';

export interface VersionCheckResult {
  platform: MobilePlatform;
  currentVersion: string;
  minVersion: string;
  latestVersion: string;
  forceUpdate: boolean;
  recommendUpdate: boolean;
  storeUrl: string;
  releaseNotes: string;
  maintenanceMode: boolean;
}

@Injectable()
export class MobileConfigService {
  checkVersion(
    platform: MobilePlatform,
    currentVersion = '0.0.0',
  ): VersionCheckResult {
    const isAndroid = platform === MobilePlatform.ANDROID;

    const minVersion = isAndroid
      ? process.env.MOBILE_MIN_VERSION_ANDROID || '1.0.0'
      : process.env.MOBILE_MIN_VERSION_IOS || '1.0.0';

    const latestVersion = isAndroid
      ? process.env.MOBILE_LATEST_VERSION_ANDROID || '1.2.0'
      : process.env.MOBILE_LATEST_VERSION_IOS || '1.2.0';

    const storeUrl = isAndroid
      ? process.env.MOBILE_STORE_URL_ANDROID ||
        'https://play.google.com/store/apps/details?id=com.sistema.app'
      : process.env.MOBILE_STORE_URL_IOS ||
        'https://apps.apple.com/app/id1234567890';

    const releaseNotes =
      process.env.MOBILE_RELEASE_NOTES ||
      'Mejoras continuas de rendimiento, estabilidad y nuevas funciones.';

    const maintenanceMode = process.env.MOBILE_MAINTENANCE_MODE === 'true';

    const forceUpdate = this.compareSemver(currentVersion, minVersion) < 0;
    const recommendUpdate =
      !forceUpdate && this.compareSemver(currentVersion, latestVersion) < 0;

    return {
      platform,
      currentVersion,
      minVersion,
      latestVersion,
      forceUpdate,
      recommendUpdate,
      storeUrl,
      releaseNotes,
      maintenanceMode,
    };
  }

  getAppConfig() {
    return {
      appName: process.env.APP_NAME || 'Sistema Core',
      supportEmail: process.env.SUPPORT_EMAIL || 'soporte@tudominio.com',
      termsUrl:
        process.env.TERMS_URL || 'https://tudominio.com/terminos-y-condiciones',
      privacyPolicyUrl:
        process.env.PRIVACY_URL || 'https://tudominio.com/aviso-de-privacidad',
      apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000/api',
      realtimeNamespace: '/realtime',
      maxUploadSizeMb: 5,
    };
  }

  private compareSemver(v1: string, v2: string): number {
    const parse = (v: string) =>
      v
        .replace(/^v/, '')
        .split('.')
        .map((p) => {
          const num = parseInt(p, 10);
          return isNaN(num) ? 0 : num;
        });

    const [maj1, min1, pat1] = parse(v1);
    const [maj2, min2, pat2] = parse(v2);

    if (maj1 !== maj2) return (maj1 ?? 0) - (maj2 ?? 0);
    if (min1 !== min2) return (min1 ?? 0) - (min2 ?? 0);
    return (pat1 ?? 0) - (pat2 ?? 0);
  }
}
