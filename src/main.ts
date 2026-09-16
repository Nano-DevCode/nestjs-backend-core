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

  // 3. Configuración CORS defensiva y flexible para desarrollo y producción
  const rawOrigins = (
    process.env.FRONTEND_URL ||
    'https://sistema.nano-service.com,http://localhost:5173,http://localhost:5174,http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);

  // Asegurar siempre el dominio de producción del sistema
  const productionDomains = [
    'https://sistema.nano-service.com',
    'http://sistema.nano-service.com',
  ];
  for (const domain of productionDomains) {
    if (!rawOrigins.includes(domain)) {
      rawOrigins.push(domain);
    }
  }

  const configuredOrigins = rawOrigins;

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // 1. Peticiones sin cabecera Origin (móviles nativos, curl, Postman, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.replace(/\/+$/, '');

      // 2. Orígenes explícitamente configurados en FRONTEND_URL
      if (configuredOrigins.includes(normalizedOrigin)) {
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

      // 4. En entorno de desarrollo, permitir puertos dinámicos en localhost o 127.0.0.1
      if (!isProduction) {
        const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(
          normalizedOrigin,
        );
        if (isLocalhost) {
          return callback(null, true);
        }
      }

      // 5. Rechazar orígenes no autorizados
      return callback(
        new Error(
          `Acceso denegado por política CORS: origen '${origin}' no autorizado`,
        ),
      );
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Requested-With',
      'Idempotency-Key',
      'X-API-Key',
      'x-platform',
      'x-app-version',
    ],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400,
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
  await app.listen(port);

  // Optimización de Keep-Alive para alta concurrencia y proxies inversos (NGINX, AWS ALB, Cloudflare)
  const server = app.getHttpServer() as unknown as HttpServerWithTimeout;
  server.keepAliveTimeout = 65000; // 65 segundos (mayor que los 60s típicos de los proxies)
  server.headersTimeout = 66000; // 66 segundos (debe ser estrictamente superior a keepAliveTimeout)

  console.log(`Application is running on port: ${port}`);
  console.log(
    `Scalar API documentation (Protegida) at: http://localhost:${port}/api/docs`,
  );
}
void bootstrap();
