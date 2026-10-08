import { ArgumentsHost } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { WsAllExceptionsFilter } from './ws-exception.filter';

describe('WsAllExceptionsFilter', () => {
  let filter: WsAllExceptionsFilter;
  let mockClient: { emit: jest.Mock };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new WsAllExceptionsFilter();
    mockClient = { emit: jest.fn() };
    mockHost = {
      switchToWs: jest.fn().mockReturnValue({
        getClient: jest.fn().mockReturnValue(mockClient),
        getData: jest.fn(),
      }),
    } as unknown as ArgumentsHost;
  });

  it('should handle WsException with string message', () => {
    const exception = new WsException('Unauthorized ws action');

    filter.catch(exception, mockHost);

    expect(mockClient.emit).toHaveBeenCalledWith(
      'exception',
      expect.objectContaining({
        status: 'error',
        message: 'Unauthorized ws action',
        details: null,
        timestamp: expect.any(String),
      }),
    );
  });

  it('should handle WsException with object details', () => {
    const errorObj = { message: 'Validation failed', code: 400 };
    const exception = new WsException(errorObj);

    filter.catch(exception, mockHost);

    expect(mockClient.emit).toHaveBeenCalledWith(
      'exception',
      expect.objectContaining({
        status: 'error',
        message: 'Validation failed',
        details: errorObj,
        timestamp: expect.any(String),
      }),
    );
  });

  it('should handle standard Error instance', () => {
    const exception = new Error('Database connection failed');

    filter.catch(exception, mockHost);

    expect(mockClient.emit).toHaveBeenCalledWith(
      'exception',
      expect.objectContaining({
        status: 'error',
        message: 'Database connection failed',
        details: null,
      }),
    );
  });

  it('should handle unknown exception types with fallback message', () => {
    filter.catch('some random string error', mockHost);

    expect(mockClient.emit).toHaveBeenCalledWith(
      'exception',
      expect.objectContaining({
        status: 'error',
        message: 'Error interno en el servicio WebSocket',
        details: null,
      }),
    );
  });
});
