import { NestFactory } from '@nestjs/core';
import { ValidationPipe, type LogLevel } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule as OpenApiModule,
} from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import { json, urlencoded, Request, Response, NextFunction } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LogsService } from './logs/logs.service';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis/redis.constants';

interface HttpServerWithTimeout {
  keepAliveTimeout: number;
  headersTimeout: number;
}

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';
  const logLevels: LogLevel[] = isProduction
    ? ['error', 'warn']
    : ['log', 'error', 'warn', 'debug', 'verbose'];

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: logLevels,
  });

  // Confianza en el Reverse Proxy perimetral (NGINX) para procesar correctamente
  // las cabeceras X-Forwarded-For, X-Forwarded-Proto e IPs reales de clientes
  app.set('trust proxy', 1);

  app.enableShutdownHooks();

  app.setGlobalPrefix('api', {
    exclude: ['api/docs', '/api/docs/{*path}'],
  });

  // 1. Basic Auth Middleware para proteger la ruta /api/docs
  const docsUser = process.env.DOCS_USER || 'admin';
  const docsPass = process.env.DOCS_PASSWORD || 'secret123';

  app.use('/api/docs', (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.setHeader(
        'WWW-Authenticate',
        'Basic realm="Acceso Privado a Documentacion"',
      );
      return res
        .status(401)
        .send('Se requieren credenciales para acceder a la documentacion.');
    }

    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString(
      'utf-8',
    );
    const [username, password] = credentials.split(':');

    if (username !== docsUser || password !== docsPass) {
      res.setHeader(
        'WWW-Authenticate',
        'Basic realm="Acceso Privado a Documentacion"',
      );
      return res.status(401).send('Credenciales incorrectas.');
    }

    next();
  });

  // 2. Helmet: CSP permisivo exclusivamente en /api/docs para los assets de Scalar
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/docs')) {
      return helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
              "'self'",
              "'unsafe-inline'",
              "'unsafe-eval'",
              'https://cdn.jsdelivr.net',
            ],
            styleSrc: [
              "'self'",
              "'unsafe-inline'",
              'https://cdn.jsdelivr.net',
              'https://fonts.googleapis.com',
            ],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
            imgSrc: ["'self'", 'data:', 'https:'],
          },
        },
        crossOriginEmbedderPolicy: false,
      })(req, res, next);
    }

    // Helmet estricto en todos los demás endpoints de la API (OWASP Hardening)
    return helmet({
      hidePoweredBy: true,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      frameguard: { action: 'deny' },
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      dnsPrefetchControl: { allow: false },
    })(req, res, next);
  });

  // Deshabilitar cabecera X-Powered-By de Express explícitamente
  app.disable('x-powered-by');

  app.use(json({ limit: '100kb' }));
  app.use(urlencoded({ extended: true, limit: '100kb' }));
  app.use(cookieParser());
  app.use(compression());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const logsService = app.get(LogsService);
  const redis = app.get<Redis>(REDIS_CLIENT);
  app.useGlobalFilters(new HttpExceptionFilter(logsService, redis));

  // 3. Configuración CORS defensiva y flexible para desarrollo, móvil y producción
  const allowedOrigins = [
    'http://localhost:8081',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'https://sistema.nano-service.com',
    'http://sistema.nano-service.com',
    ...(process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((o) =>
          o.trim().replace(/\/+$/, ''),
        )
      : []),
    ...(process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',').map((o) =>
          o.trim().replace(/\/+$/, ''),
        )
      : []),
  ].filter(
    (origin, index, self) => Boolean(origin) && self.indexOf(origin) === index,
  );

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // 1. Permitir clientes nativos en Android/iOS o Postman (sin header Origin o 'null')
      if (!origin || origin === 'null') {
        return callback(null, true);
      }

      const normalizedOrigin = origin.trim().replace(/\/+$/, '');

      // 2. Orígenes explícitamente permitidos (Expo 8081, React Vite 5173, etc.)
      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      // 3. Permitir cualquier subdominio o dominio principal nano-service.com
      if (
        /^https?:\/\/([a-zA-Z0-9-]+\.)*nano-service\.com$/.test(
          normalizedOrigin,
        )
      ) {
        return callback(null, true);
      }

      // 4. Permitir localhost en cualquier puerto y redes privadas locales (LAN / Wi-Fi / Emuladores)
      const isLocalOrPrivateNetwork =
        /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(
          normalizedOrigin,
        );
      if (isLocalOrPrivateNetwork) {
        return callback(null, true);
      }

      // 5. Rechazar orígenes no autorizados
      return callback(
        new Error(`CORS bloqueado para el origen: ${origin}`),
        false,
      );
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Idempotency-Key',
      'x-idempotency-key',
      'Idempotency-Key',
      'X-App-Version',
      'x-app-version',
      'x-2fa-code',
      'X-2FA-Code',
      'X-Platform',
      'x-platform',
      'X-Device-Id',
      'x-device-id',
      'Accept',
      'X-Requested-With',
      'X-API-Key',
    ],
    exposedHeaders: [
      'X-Idempotency-Key',
      'x-idempotency-key',
      'Content-Range',
      'X-Content-Range',
    ],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // 3. Especificación OpenAPI generada para la interfaz de Scalar
  const scalarConfig = new DocumentBuilder()
    .setTitle('Sistema API')
    .setDescription(
      'API Empresarial con Autenticación 2FA, RBAC, Auditoría, Resiliencia y Almacenamiento S3',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Introduce tu token JWT de acceso (Bearer)',
      },
      'bearer-jwt',
    )
    .addCookieAuth(
      'access_token',
      {
        type: 'apiKey',
        in: 'cookie',
        name: 'access_token',
        description: 'Cookie de sesión access_token',
      },
      'cookie-jwt',
    )
    .build();

  const openApiSpec = OpenApiModule.createDocument(app, scalarConfig);

  // 4. Montar Scalar API Reference
  app.use(
    '/api/docs',
    apiReference({
      spec: {
        content: openApiSpec,
      },
      theme: 'purple',
      cdn: 'https://cdn.jsdelivr.net/npm/@scalar/api-reference',
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');

  // Optimización de Keep-Alive para alta concurrencia y proxies inversos (NGINX, AWS ALB, Cloudflare)
  const server = app.getHttpServer() as unknown as HttpServerWithTimeout;
  server.keepAliveTimeout = 65000; // 65 segundos (mayor que los 60s típicos de los proxies)
  server.headersTimeout = 66000; // 66 segundos (debe ser estrictamente superior a keepAliveTimeout)

  console.log(`Application is running on: http://0.0.0.0:${port}`);
  console.log(
    `Scalar API documentation (Protegida) at: http://localhost:${port}/api/docs`,
  );
}
void bootstrap();
