import {
  verifyActivationKey,
  enforceActivationGatekeeper,
  AUTHORIZED_ACTIVATION_HASH,
} from './activation-gatekeeper';

describe('ActivationGatekeeper', () => {
  const validKey = 'nano-core-license-key-2026-auth-valid-9f82c1';

  describe('verifyActivationKey', () => {
    it('should allow execution unconditionally when NODE_ENV is "test"', () => {
      const result = verifyActivationKey(undefined, 'test');
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('TEST_MODE');
    });

    it('should reject execution when key is missing or empty in production/dev', () => {
      const missing1 = verifyActivationKey('', 'production');
      expect(missing1.allowed).toBe(false);
      expect(missing1.reason).toBe('MISSING_KEY');

      const missing2 = verifyActivationKey('   ', 'development');
      expect(missing2.allowed).toBe(false);
      expect(missing2.reason).toBe('MISSING_KEY');

      const missing3 = verifyActivationKey(undefined, 'development');
      expect(missing3.allowed).toBe(false);
      expect(missing3.reason).toBe('MISSING_KEY');
    });

    it('should reject execution when key has invalid hash', () => {
      const result = verifyActivationKey('invalid-license-key-123', 'production');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('INVALID_KEY');
    });

    it('should allow execution when valid key matching AUTHORIZED_ACTIVATION_HASH is provided', () => {
      const result = verifyActivationKey(validKey, 'production');
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('ALLOWED');
    });

    it('should handle whitespace in valid key gracefully', () => {
      const result = verifyActivationKey(`  ${validKey}  `, 'development');
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('ALLOWED');
    });
  });

  describe('enforceActivationGatekeeper', () => {
    let originalEnv: NodeJS.ProcessEnv;
    let exitSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      originalEnv = { ...process.env };
      exitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit called with ${code}`);
      });
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      process.env = originalEnv;
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should do nothing if key is valid', () => {
      process.env.NODE_ENV = 'production';
      process.env.SYSTEM_ACTIVATION_KEY = validKey;

      expect(() => enforceActivationGatekeeper()).not.toThrow();
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('should call process.exit(1) and print error box if key is invalid', () => {
      process.env.NODE_ENV = 'production';
      process.env.SYSTEM_ACTIVATION_KEY = 'hacker-key';

      expect(() => enforceActivationGatekeeper()).toThrow('process.exit called with 1');
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should bypass gatekeeper if NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.SYSTEM_ACTIVATION_KEY;

      expect(() => enforceActivationGatekeeper()).not.toThrow();
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });
});

