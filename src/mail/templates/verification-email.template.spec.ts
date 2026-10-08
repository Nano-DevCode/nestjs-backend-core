import { getVerificationEmailTemplate } from './verification-email.template';

describe('getVerificationEmailTemplate', () => {
  it('should generate verification email with name and URL', () => {
    const result = getVerificationEmailTemplate({
      name: 'Maria',
      verificationUrl: 'https://example.com/verify?token=abc',
    });

    expect(result.subject).toBe('Verificación de cuenta');
    expect(result.html).toContain('Hola, Maria');
    expect(result.html).toContain('https://example.com/verify?token=abc');
    expect(result.text).toContain('Hola, Maria');
    expect(result.text).toContain('https://example.com/verify?token=abc');
  });

  it('should generate template with generic greeting when name is omitted', () => {
    const result = getVerificationEmailTemplate({
      verificationUrl: 'https://example.com/verify?token=abc',
    });

    expect(result.html).toContain('Hola:');
    expect(result.text).toContain('Hola.');
  });
});

