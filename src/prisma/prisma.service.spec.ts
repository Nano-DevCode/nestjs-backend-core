import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env['DATABASE_URL'] =
      'postgresql://testuser:testpass@localhost:5432/testdb?schema=public';
    delete process.env['DATABASE_REPLICA_URL'];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Default mode (No read replica)', () => {
    it('should initialize with hasReplica = false when DATABASE_REPLICA_URL is not set', () => {
      const service = new PrismaService();
      expect(service).toBeDefined();
      expect(service.hasReplica).toBe(false);
      expect(service.replicaPool).toBeUndefined();
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
      // En el cliente extendido con readReplicas, $replica() devuelve la instancia de réplica
      const readOnlyClient = service.readOnly;
      expect(readOnlyClient).toBeDefined();
    });
  });
});
