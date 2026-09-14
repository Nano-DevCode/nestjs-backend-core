import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma, LogLevel } from '../../../prisma/generated/prisma/client';
import type { LogsService } from '../../logs/logs.service';

/**
 * Sanitiza cualquier mensaje devuelto al cliente para evitar fugas de
 * cadenas de conexión, contraseñas o tokens.
 */
function sanitizePublicMessage(
  msg: unknown,
): string | string[] | Record<string, unknown> {
  if (typeof msg === 'string') {
    return msg
      .replace(/postgresql:\/\/[^@]+@/gi, 'postgresql://[REDACTED]@')
      .replace(/password[:=]\s*[^\s,;]+/gi, 'password=[REDACTED]')
      .replace(/token[:=]\s*[^\s,;]+/gi, 'token=[REDACTED]');
  }
  if (Array.isArray(msg)) {
    return msg.map((item) =>
      typeof item === 'string'
        ? (sanitizePublicMessage(item) as string)
        : String(item),
    );
  }
  if (typeof msg === 'object' && msg !== null) {
    return msg as Record<string, unknown>;
  }
  return String(msg);
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly logsService?: LogsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] | object =
      'Error interno del servidor. Por favor, intenta de nuevo más tarde.';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null && 'message' in res) {
        message = sanitizePublicMessage(
          (res as { message: string | string[] }).message,
        );
      } else if (typeof res === 'string') {
        message = sanitizePublicMessage(res);
      } else {
        message = sanitizePublicMessage(exception.message);
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      statusCode = HttpStatus.BAD_REQUEST;
      switch (exception.code) {
        case 'P2002': {
          statusCode = HttpStatus.CONFLICT;
          const target = exception.meta?.target;
          const fields = Array.isArray(target)
            ? target.join(', ')
            : typeof target === 'string'
              ? target
              : 'campo único';
          message = `Ya existe un registro con ese valor para: ${fields}`;
          break;
        }
        case 'P2025':
          statusCode = HttpStatus.NOT_FOUND;
          message = 'El recurso solicitado no fue encontrado';
          break;
        case 'P2003':
          statusCode = HttpStatus.BAD_REQUEST;
          message = 'Operación no permitida por restricción de clave foránea';
          break;
        default:
          statusCode = HttpStatus.BAD_REQUEST;
          message = 'Error en la operación de base de datos';
          break;
      }
      this.logger.error(
        `[PrismaError ${exception.code}] en ${request.method} ${request.url}: ${exception.message}`,
      );
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      statusCode = HttpStatus.BAD_REQUEST;
      message = 'Datos de entrada inválidos para la operación de datos';
      this.logger.error(
        `[PrismaValidationError] en ${request.method} ${request.url}: ${exception.message}`,
      );
    } else if (
      exception instanceof Prisma.PrismaClientInitializationError ||
      exception instanceof Prisma.PrismaClientRustPanicError ||
      exception instanceof Prisma.PrismaClientUnknownRequestError
    ) {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message =
        'Error interno en el servicio de datos. Por favor, intenta más tarde.';
      this.logger.error(
        `[PrismaFatalError] en ${request.method} ${request.url}: ${(exception as Error).message}`,
      );
    } else {
      const error = exception as Error;
      this.logger.error(
        `[UnhandledException] en ${request.method} ${request.url}: ${error?.message || 'Error desconocido'}`,
        error?.stack,
      );
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message =
        'Error interno del servidor. Por favor, intenta de nuevo más tarde.';
    }

    // Captura automática de excepciones no controladas 5xx enviándolas directamente a la cola de logs
    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR && this.logsService) {
      const err = exception as Error;
      this.logsService.enqueueBackendLog({
        level: LogLevel.ERROR,
        context: 'GlobalExceptionFilter',
        message:
          err?.message ||
          (typeof message === 'string' ? message : JSON.stringify(message)),
        stackTrace: err?.stack,
        metadata: {
          url: request.url,
          method: request.method,
          statusCode,
          ip: request.ip || request.socket?.remoteAddress,
          userAgent: request.headers?.['user-agent'],
        },
        userId: (request as unknown as { user?: { id?: string } }).user?.id,
      });
    }

    response.status(statusCode).json({
      statusCode,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
