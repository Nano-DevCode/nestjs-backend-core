import { TwoFactorCryptoService } from './two-factor-crypto.service';

describe('TwoFactorCryptoService', () => {
  let service: TwoFactorCryptoService;

  beforeEach(() => {
    service = new TwoFactorCryptoService();
  });

  describe('encrypt y decrypt', () => {
    it('debe cifrar y descifrar exitosamente una cadena de texto (simetría AES-256-GCM)', () => {
      const plaintext = 'JBSWY3DPEHPK3PXP'; // Base32 TOTP secret de ejemplo
      const ciphertext = service.encrypt(plaintext);

      expect(ciphertext).toBeDefined();
      expect(ciphertext).not.toEqual(plaintext);
      expect(ciphertext.split(':')).toHaveLength(3);

      const decrypted = service.decrypt(ciphertext);
      expect(decrypted).toBe(plaintext);
    });

    it('debe producir textos cifrados distintos para la misma entrada (IV aleatorio único)', () => {
      const plaintext = 'SECRET_KEY_12345';
      const cipher1 = service.encrypt(plaintext);
      const cipher2 = service.encrypt(plaintext);

      expect(cipher1).not.toBe(cipher2);
      expect(service.decrypt(cipher1)).toBe(plaintext);
      expect(service.decrypt(cipher2)).toBe(plaintext);
    });

    it('debe retornar el texto original si el formato del ciphertext es inválido', () => {
      expect(service.decrypt('plain-text-not-encrypted')).toBe(
        'plain-text-not-encrypted',
      );
      expect(service.decrypt('part1:part2')).toBe('part1:part2');
    });

    it('debe retornar el texto original si la etiqueta de autenticación (auth tag) o IV están corruptos', () => {
      const validCipher = service.encrypt('SensitiveData');
      const [iv, , encrypted] = validCipher.split(':');
      const corruptedCipher = `${iv}:deadbeef0000:${encrypted}`;

      const result = service.decrypt(corruptedCipher);
      expect(result).toBe(corruptedCipher);
    });
  });
});
