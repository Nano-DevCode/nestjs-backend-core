import { getPasswordResetTemplate } from './password-reset.template';

describe('getPasswordResetTemplate', () => {
  it('should generate template with name and reset link', () => {
    const result = getPasswordResetTemplate({
      name: 'Carlos',
      resetUrl: 'https://example.com/reset?token=xyz',
    });

    expect(result.subject).toBe('Restablecimiento de contraseña');
    expect(result.html).toContain('Hola, Carlos');
    expect(result.html).toContain('https://example.com/reset?token=xyz');
    expect(result.text).toContain('Hola, Carlos');
    expect(result.text).toContain('https://example.com/reset?token=xyz');
  });

  it('should generate template with default greeting when name is omitted', () => {
    const result = getPasswordResetTemplate({
      resetUrl: 'https://example.com/reset?token=xyz',
    });

    expect(result.html).toContain('Hola:');
    expect(result.text).toContain('Hola.');
  });
});

