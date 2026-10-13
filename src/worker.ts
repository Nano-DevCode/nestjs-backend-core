import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';
import { enforceActivationGatekeeper } from './common/security/activation-gatekeeper';

async function bootstrap() {
  // Candado de seguridad y activación
  enforceActivationGatekeeper();

  const logger = new Logger('WorkersEngine');
  logger.log('⚡ Iniciando nodo de procesamiento asíncrono (BullMQ Worker Node)...');

  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  app.enableShutdownHooks();

  logger.log('✅ Nodo sistema_workers inicializado y listo para consumir trabajos de Redis.');
  logger.log('📋 Colas suscritas: [pdf-queue, mail-queue, exports-queue, webhooks-queue, logs-queue]');
}

bootstrap().catch((err) => {
  console.error('FATAL: Error al iniciar sistema_workers:', err);
  process.exit(1);
});

