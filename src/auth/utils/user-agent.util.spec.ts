import { parseUserAgent } from './user-agent.util';

describe('parseUserAgent', () => {
  it('should return unknown for empty or undefined user agent', () => {
    expect(parseUserAgent()).toEqual({
      deviceType: 'unknown',
      browser: 'Desconocido',
      os: 'Desconocido',
    });
  });

  it('should detect Windows 10/11 and Chrome desktop', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const result = parseUserAgent(ua);

    expect(result.deviceType).toBe('desktop');
    expect(result.os).toBe('Windows 10/11');
    expect(result.browser).toBe('Google Chrome');
  });

  it('should detect iPhone iOS and Mobile Safari', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const result = parseUserAgent(ua);

    expect(result.deviceType).toBe('mobile');
    expect(result.os).toBe('iOS');
    expect(result.browser).toBe('Apple Safari');
  });

  it('should detect Android Tablet and Firefox', () => {
    const ua =
      'Mozilla/5.0 (Android; Tablet; rv:68.0) Gecko/68.0 Firefox/68.0';
    const result = parseUserAgent(ua);

    expect(result.deviceType).toBe('tablet');
    expect(result.os).toBe('Android');
    expect(result.browser).toBe('Mozilla Firefox');
  });
});

