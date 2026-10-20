import 'dotenv/config';
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import mongoose, {
  type Connection,
  type ConnectOptions,
  type Model,
  type Schema,
} from 'mongoose';

export interface MongoConfigOptions {
  uri: string | null;
  isEnabled: boolean;
  dbName?: string;
  maxPoolSize: number;
  minPoolSize: number;
  connectTimeoutMS: number;
  serverSelectionTimeoutMS: number;
}

/**
 * Resuelve la URI de conexión a MongoDB a partir de las variables de entorno.
 * Retorna `null` si no se proporcionaron las claves/variables de MongoDB,
 * permitiendo que el sistema arranque sin levantar la conexión.
 */
export function resolveMongoConfig(
  env: NodeJS.ProcessEnv = process.env,
): MongoConfigOptions {
  const explicitFlag = env['MONGO_ENABLED']?.trim().toLowerCase();
  if (explicitFlag === 'false' || explicitFlag === '0') {
    return {
      uri: null,
      isEnabled: false,
      maxPoolSize: 20,
      minPoolSize: 2,
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
    };
  }

  const directUri = (env['MONGODB_URI'] || env['MONGO_URI'])?.trim();
  const mongoHost = env['MONGO_HOST']?.trim();
  const mongoUser = env['MONGO_USER']?.trim();
  const mongoPassword = env['MONGO_PASSWORD']?.trim();
  const mongoDb = env['MONGO_DB']?.trim() || 'sistema_mongo';
  const mongoPort = Number(env['MONGO_PORT']) || 27017;
  const authSource = env['MONGO_AUTH_SOURCE']?.trim() || 'admin';

  const maxPoolSize = Number(env['MONGO_POOL_MAX']) || 25;
  const minPoolSize = Number(env['MONGO_POOL_MIN']) || 5;
  const connectTimeoutMS = Number(env['MONGO_TIMEOUT_MS']) || 5000;
  const serverSelectionTimeoutMS =
    Number(env['MONGO_SERVER_SELECTION_TIMEOUT_MS']) || 5000;

  if (directUri && directUri.length > 0) {
    return {
      uri: directUri,
      isEnabled: true,
      dbName: mongoDb,
      maxPoolSize,
      minPoolSize,
      connectTimeoutMS,
      serverSelectionTimeoutMS,
    };
  }

  // Si se definieron credenciales o host explícito de Mongo, construir la URI
  const hasCredentialsOrHost = Boolean(
    (mongoHost && mongoHost.length > 0) ||
    (mongoUser &&
      mongoUser.length > 0 &&
      mongoPassword &&
      mongoPassword.length > 0),
  );

  if (!hasCredentialsOrHost) {
    return {
      uri: null,
      isEnabled: false,
      maxPoolSize,
      minPoolSize,
      connectTimeoutMS,
      serverSelectionTimeoutMS,
    };
  }

  const host = mongoHost || 'localhost';
  const authSegment =
    mongoUser && mongoPassword
      ? `${encodeURIComponent(mongoUser)}:${encodeURIComponent(mongoPassword)}@`
      : '';
  const querySegment =
    mongoUser && mongoPassword
      ? `?authSource=${encodeURIComponent(authSource)}`
      : '';

  const constructedUri = `mongodb://${authSegment}${host}:${mongoPort}/${encodeURIComponent(mongoDb)}${querySegment}`;

  return {
    uri: constructedUri,
    isEnabled: true,
    dbName: mongoDb,
    maxPoolSize,
    minPoolSize,
    connectTimeoutMS,
    serverSelectionTimeoutMS,
  };
}

@Injectable()
export class MongoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoService.name);
  public readonly isEnabled: boolean;
  public readonly config: MongoConfigOptions;
  private connectionInstance: Connection | null = null;

  constructor() {
    this.config = resolveMongoConfig(process.env);
    this.isEnabled = this.config.isEnabled;

    if (this.isEnabled && this.config.uri) {
      this.logger.log(
        'Configuración de MongoDB detectada (claves presentes). Cliente Mongoose preparado.',
      );
      this.connectionInstance = mongoose.createConnection();
    } else {
      this.logger.log(
        'Modo MongoDB desactivado (claves MONGODB_URI / MONGO_HOST no configuradas). El sistema operará únicamente con PostgreSQL.',
      );
    }
  }

  /**
   * Retorna la conexión activa de Mongoose o `null` si MongoDB no está configurado.
   */
  get connection(): Connection | null {
    return this.connectionInstance;
  }

  /**
   * Retorna la conexión activa o lanza excepción si se intenta usar cuando está deshabilitada.
   */
  getConnectionOrThrow(): Connection {
    if (!this.isEnabled || !this.connectionInstance) {
      throw new ServiceUnavailableException(
        'La conexión a MongoDB no está habilitada en este entorno (faltan variables MONGODB_URI o MONGO_HOST).',
      );
    }
    return this.connectionInstance;
  }

  /**
   * Obtiene o registra un modelo de Mongoose sobre la conexión activa.
   */
  getModel<T>(name: string, schema: Schema<T>, collection?: string): Model<T> {
    const conn = this.getConnectionOrThrow();
    if (conn.models[name]) {
      return conn.models[name] as Model<T>;
    }
    return conn.model<T>(name, schema, collection);
  }

  /**
   * Acceso directo a una colección nativa de MongoDB (estilo driver / Prisma).
   */
  collection(name: string) {
    const conn = this.getConnectionOrThrow();
    return conn.collection(name);
  }

  /**
   * Verifica el estado de salud de la conexión a MongoDB.
   */
  async isHealthy(): Promise<{ enabled: boolean; connected: boolean }> {
    if (!this.isEnabled || !this.connectionInstance) {
      return { enabled: false, connected: false };
    }
    // readyState: 1 = connected
    const isConnected = Number(this.connectionInstance.readyState) === 1;
    if (!isConnected) {
      return { enabled: true, connected: false };
    }
    try {
      await this.connectionInstance.db?.admin().ping();
      return { enabled: true, connected: true };
    } catch {
      return { enabled: true, connected: false };
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled || !this.connectionInstance || !this.config.uri) {
      return;
    }

    const options: ConnectOptions = {
      dbName: this.config.dbName,
      maxPoolSize: this.config.maxPoolSize,
      minPoolSize: this.config.minPoolSize,
      connectTimeoutMS: this.config.connectTimeoutMS,
      serverSelectionTimeoutMS: this.config.serverSelectionTimeoutMS,
    };

    try {
      await this.connectionInstance.openUri(this.config.uri, options);
      this.logger.log(
        'Conexión a MongoDB (Mongoose) establecida exitosamente.',
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error al conectar con MongoDB: ${err.message}`,
        err.stack,
      );
      if (
        process.env['NODE_ENV'] === 'production' &&
        process.env['MONGO_REQUIRED'] === 'true'
      ) {
        throw error;
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connectionInstance) {
      await this.connectionInstance.close();
      this.logger.log('Conexión a MongoDB cerrada correctamente.');
    }
  }
}
