import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { Prisma } from '../../../prisma/generated/prisma/client';
import type { ArgumentsHost } from '@nestjs/common';

import type { Request, Response } from 'express';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let mockResponse: { status: jest.Mock };
  let mockRequest: { url: string; method: string };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockResponse = {
      status: mockStatus,
    };
    mockRequest = {
      url: '/test-endpoint',
      method: 'POST',
    };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse as unknown as Response,
        getRequest: () => mockRequest as unknown as Request,
      }),
    } as unknown as ArgumentsHost;
  });

  it('debe manejar HttpException estándar y preservar el código y mensaje', () => {
    const exception = new HttpException(
      'Petición inválida',
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Petición inválida',
        path: '/test-endpoint',
      }),
    );
  });

  it('debe capturar error P2002 de Prisma y devolver 409 Conflict seguro', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`)',
      {
        code: 'P2002',
        clientVersion: '7.10.0',
        meta: { target: ['email'] },
      },
    );

    filter.catch(prismaError, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        message: 'Ya existe un registro con ese valor para: email',
        path: '/test-endpoint',
      }),
    );
  });

  it('debe capturar error P2025 de Prisma y devolver 404 Not Found', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'An operation failed because it depends on one or more records that were required but not found.',
      {
        code: 'P2025',
        clientVersion: '7.10.0',
      },
    );

    filter.catch(prismaError, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'El recurso solicitado no fue encontrado',
        path: '/test-endpoint',
      }),
    );
  });

  it('debe ocultar información sensible en errores no controlados y responder 500', () => {
    const unhandledError = new Error(
      'DATABASE CONNECTION LEAKED PASSWORD=secret',
    );

    filter.catch(unhandledError, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message:
          'Error interno del servidor. Por favor, intenta de nuevo más tarde.',
        path: '/test-endpoint',
      }),
    );
    const calls = mockJson.mock.calls as Array<[{ message: string }]>;
    const responsePayload = calls[0]?.[0];
    expect(responsePayload?.message).not.toContain('PASSWORD');
  });
});
