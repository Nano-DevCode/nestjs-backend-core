import { ServiceUnavailableException } from '@nestjs/common';
import { MongoService, resolveMongoConfig } from './mongo.service';

describe('MongoService (Conditional Mongoose Connection)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env['MONGODB_URI'];
    delete process.env['MONGO_URI'];
    delete process.env['MONGO_HOST'];
    delete process.env['MONGO_USER'];
    delete process.env['MONGO_PASSWORD'];
    delete process.env['MONGO_DB'];
    delete process.env['MONGO_ENABLED'];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Disabled mode (Sin claves de Mongo en variables de entorno)', () => {
    it('resolveMongoConfig debe retornar isEnabled = false y uri = null cuando no hay variables', () => {
      const cfg = resolveMongoConfig({});
      expect(cfg.isEnabled).toBe(false);
      expect(cfg.uri).toBeNull();
    });

    it('MongoService debe iniciar desactivado sin abrir conexión si no hay claves', async () => {
      const service = new MongoService();
      expect(service.isEnabled).toBe(false);
      expect(service.connection).toBeNull();

      await expect(service.onModuleInit()).resolves.toBeUndefined();
      await expect(service.isHealthy()).resolves.toEqual({
        enabled: false,
        connected: false,
      });
      expect(() => service.getConnectionOrThrow()).toThrow(
        ServiceUnavailableException,
      );
    });

    it('debe respetar MONGO_ENABLED=false incluso si existe MONGODB_URI', () => {
      const cfg = resolveMongoConfig({
        MONGO_ENABLED: 'false',
        MONGODB_URI: 'mongodb://localhost:27017/sistema_mongo',
      });
      expect(cfg.isEnabled).toBe(false);
      expect(cfg.uri).toBeNull();
    });
  });

  describe('Enabled mode (Con claves de Mongo en variables de entorno)', () => {
    it('debe activarse cuando se provee MONGODB_URI directamente', async () => {
      process.env['MONGODB_URI'] = 'mongodb://localhost:27017/sistema_mongo';

      const service = new MongoService();
      expect(service.isEnabled).toBe(true);
      expect(service.config.uri).toBe(
        'mongodb://localhost:27017/sistema_mongo',
      );
      expect(service.connection).toBeDefined();
      expect(service.connection).not.toBeNull();

      await service.onModuleDestroy();
    });

    it('debe construir la URI automáticamente cuando se proveen MONGO_HOST, MONGO_USER y MONGO_PASSWORD', async () => {
      process.env['MONGO_HOST'] = '127.0.0.1';
      process.env['MONGO_PORT'] = '27017';
      process.env['MONGO_USER'] = 'admin';
      process.env['MONGO_PASSWORD'] = 'secretPass!';
      process.env['MONGO_DB'] = 'logs_db';

      const service = new MongoService();
      expect(service.isEnabled).toBe(true);
      expect(service.config.uri).toBe(
        'mongodb://admin:secretPass!@127.0.0.1:27017/logs_db?authSource=admin',
      );
      expect(service.connection).not.toBeNull();

      await service.onModuleDestroy();
    });
  });
});

