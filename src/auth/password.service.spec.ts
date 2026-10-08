import { BadRequestException } from '@nestjs/common';
import { PasswordService } from './password.service';
import * as bcrypt from 'bcrypt';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService();
  });

  describe('hash', () => {
    it('debe generar un hash bcrypt válido con costo 10', async () => {
      const password = 'SuperSecretPassword123!';
      const hash = await service.hash(password);

      expect(hash).toBeDefined();
      expect(hash).toMatch(/^\$2[aby]\$10\$/);
      const isMatch = await bcrypt.compare(password, hash);
      expect(isMatch).toBe(true);
    });
  });

  describe('compare', () => {
    it('debe retornar true cuando la contraseña coincide con el hash', async () => {
      const password = 'CorrectPassword';
      const hash = await bcrypt.hash(password, 10);

      const result = await service.compare(password, hash);
      expect(result).toBe(true);
    });

    it('debe retornar false cuando la contraseña no coincide', async () => {
      const password = 'CorrectPassword';
      const wrongPassword = 'WrongPassword';
      const hash = await bcrypt.hash(password, 10);

      const result = await service.compare(wrongPassword, hash);
      expect(result).toBe(false);
    });
  });

  describe('compareWithDummy', () => {
    it('debe ejecutar una comparación bcrypt dummy y retornar false', async () => {
      const result = await service.compareWithDummy('anyPassword');
      expect(result).toBe(false);
    });
  });

  describe('validatePasswordStrength', () => {
    it('no debe lanzar excepción si la contraseña tiene al menos 8 caracteres', () => {
      expect(() => service.validatePasswordStrength('12345678')).not.toThrow();
      expect(() =>
        service.validatePasswordStrength('LongerPassword123!'),
      ).not.toThrow();
    });

    it('debe lanzar BadRequestException si la contraseña tiene menos de 8 caracteres o está vacía', () => {
      expect(() => service.validatePasswordStrength('')).toThrow(
        BadRequestException,
      );
      expect(() => service.validatePasswordStrength('1234567')).toThrow(
        BadRequestException,
      );
    });
  });
});

