import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env['DATABASE_URL'] =
      'postgresql://testuser:testpass@localhost:5432/testdb?schema=public';
    delete process.env['DATABASE_REPLICA_URL'];
    delete process.env['MONGODB_URI'];
    delete process.env['MONGO_URI'];
    delete process.env['MONGO_HOST'];
    delete process.env['MONGO_USER'];
    delete process.env['MONGO_PASSWORD'];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Default mode (No read replica & No MongoDB)', () => {
    it('should initialize with hasReplica = false and hasMongo = false when optional vars are not set', () => {
      const service = new PrismaService();
      expect(service).toBeDefined();
      expect(service.hasReplica).toBe(false);
      expect(service.replicaPool).toBeUndefined();
      expect(service.hasMongo).toBe(false);
      expect(service.mongo.isEnabled).toBe(false);
    });

    it('should return self on readOnly getter when hasReplica is false (transparent fallback)', () => {
      const service = new PrismaService();
      expect(service.readOnly).toBe(service);
    });
  });

  describe('Opt-in mode (With read replica configured)', () => {
    it('should initialize with hasReplica = true when DATABASE_REPLICA_URL is set', () => {
      process.env['DATABASE_REPLICA_URL'] =
        'postgresql://testuser:testpass@localhost:5433/testdb?schema=public';

      const service = new PrismaService();
      expect(service).toBeDefined();
      expect(service.hasReplica).toBe(true);
      expect(service.replicaPool).toBeDefined();
    });

    it('should return $replica() on readOnly getter when hasReplica is true', () => {
      process.env['DATABASE_REPLICA_URL'] =
        'postgresql://testuser:testpass@localhost:5433/testdb?schema=public';

      const service = new PrismaService();
      const readOnlyClient = service.readOnly;
      expect(readOnlyClient).toBeDefined();
    });
  });

  describe('Opt-in mode (With MongoDB configured)', () => {
    it('should initialize with hasMongo = true when MONGODB_URI is set', async () => {
      process.env['MONGODB_URI'] = 'mongodb://localhost:27017/test_mongo';

      const service = new PrismaService();
      expect(service.hasMongo).toBe(true);
      expect(service.mongo.isEnabled).toBe(true);
      await service.mongo.onModuleDestroy();
    });
  });
});
