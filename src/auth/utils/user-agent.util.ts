export interface ParsedUserAgent {
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  browser: string;
  os: string;
}

export function parseUserAgent(ua?: string): ParsedUserAgent {
  if (!ua || typeof ua !== 'string') {
    return {
      deviceType: 'unknown',
      browser: 'Desconocido',
      os: 'Desconocido',
    };
  }

  const lower = ua.toLowerCase();

  // 1. Tipo de Dispositivo
  let deviceType: 'mobile' | 'tablet' | 'desktop' | 'unknown' = 'desktop';
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    deviceType = 'tablet';
  } else if (/mobile|iphone|ipod|android.*mobile|blackberry|opera mini|windows phone/i.test(ua)) {
    deviceType = 'mobile';
  } else if (/android/i.test(ua)) {
    deviceType = 'tablet';
  }

  // 2. Sistema Operativo
  let os = 'Desconocido';
  if (/windows nt 10.0/i.test(ua)) os = 'Windows 10/11';
  else if (/windows nt 6.3/i.test(ua)) os = 'Windows 8.1';
  else if (/windows nt 6.1/i.test(ua)) os = 'Windows 7';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/mac os x/i.test(ua)) os = 'macOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/linux/i.test(ua)) os = 'Linux';

  // 3. Navegador
  let browser = 'Desconocido';
  if (/edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = 'Opera';
  else if (/chrome|crios/i.test(ua)) browser = 'Google Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Mozilla Firefox';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Apple Safari';
  else if (/msie|trident/i.test(ua)) browser = 'Internet Explorer';

  return {
    deviceType,
    browser,
    os,
  };
}

