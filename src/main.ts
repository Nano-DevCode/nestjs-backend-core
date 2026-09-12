import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, urlencoded, Request, Response, NextFunction } from 'express';
import { HttpExceptionFilter } from './common/filters';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

    // Helmet estricto en todos los demás endpoints de la API
    return helmet()(req, res, next);
  });

  app.use(json({ limit: '100kb' }));
  app.use(urlencoded({ extended: true, limit: '100kb' }));
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  // 3. Documento OpenAPI / Swagger
  const swaggerConfig = new DocumentBuilder()
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

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // 4. Montar Scalar API Reference
  app.use(
    '/api/docs',
    apiReference({
      spec: {
        content: document,
      },
      theme: 'purple',
      cdn: 'https://cdn.jsdelivr.net/npm/@scalar/api-reference',
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application is running on port: ${port}`);
  console.log(
    `Scalar API documentation (Protegida) at: http://localhost:${port}/api/docs`,
  );
}
void bootstrap();
