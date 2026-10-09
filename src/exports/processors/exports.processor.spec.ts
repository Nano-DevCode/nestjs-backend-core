import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { ExportsProcessor } from './exports.processor';
import { ExportsService } from '../exports.service';
import { S3StorageService } from '../../files/services/s3-storage.service';
import { NotificationGateway } from '../../notifications/notifications.gateway';
import type { ExportRequestPayload } from '../exports.interfaces';

describe('ExportsProcessor', () => {
  let processor: ExportsProcessor;
  let exportsServiceMock: {
    updateExportStatus: jest.Mock;
    fetchDataset: jest.Mock;
    formatDatasetAsCsv: jest.Mock;
  };
  let s3StorageServiceMock: {
    uploadFile: jest.Mock;
    getFileUrl: jest.Mock;
  };
  let notificationGatewayMock: {
    sendToUser: jest.Mock;
  };

  beforeEach(async () => {
    exportsServiceMock = {
      updateExportStatus: jest.fn().mockResolvedValue(undefined),
      fetchDataset: jest.fn().mockResolvedValue([{ id: 1, name: 'Alice' }]),
      formatDatasetAsCsv: jest.fn().mockReturnValue('id,name\r\n1,Alice'),
    };

    s3StorageServiceMock = {
      uploadFile: jest.fn().mockResolvedValue('ok'),
      getFileUrl: jest.fn().mockReturnValue('/api/files/view/exports/test.csv'),
    };

    notificationGatewayMock = {
      sendToUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportsProcessor,
        { provide: ExportsService, useValue: exportsServiceMock },
        { provide: S3StorageService, useValue: s3StorageServiceMock },
        { provide: NotificationGateway, useValue: notificationGatewayMock },
      ],
    }).compile();

    processor = module.get<ExportsProcessor>(ExportsProcessor);
  });

  it('debe estar definido', () => {
    expect(processor).toBeDefined();
  });

  it('debe procesar exportación CSV, subir a S3 y emitir evento WebSocket EXPORT_READY', async () => {
    const mockJob = {
      id: 'job-1',
      data: {
        exportId: 'exp-123',
        userId: 'u-1',
        title: 'Reporte Usuarios',
        format: 'csv',
        datasetType: 'users',
        requestedAt: new Date().toISOString(),
      } as ExportRequestPayload,
    } as unknown as Job<ExportRequestPayload, any, string>;

    const result = await processor.process(mockJob);

    expect(result.exportId).toBe('exp-123');
    expect(result.recordCount).toBe(1);
    expect(result.fileUrl).toBe('/api/files/view/exports/test.csv');

    // Comprobar actualización de estados
    expect(exportsServiceMock.updateExportStatus).toHaveBeenCalledWith(
      'exp-123',
      expect.objectContaining({ status: 'completed', progressPercentage: 100 }),
    );

    // Comprobar subida a S3
    expect(s3StorageServiceMock.uploadFile).toHaveBeenCalledWith(
      expect.any(String),
      'exports/u-1/exp-123.csv',
      expect.any(Buffer),
      'text/csv',
    );

    // Comprobar emisión por WebSocket
    expect(notificationGatewayMock.sendToUser).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({
        type: 'EXPORT_READY',
        exportId: 'exp-123',
        fileUrl: '/api/files/view/exports/test.csv',
      }),
    );
  });

  it('debe soportar registros directos en memoria (custom dataset)', async () => {
    const customRecords = [{ code: 'A', value: 100 }];
    const mockJob = {
      id: 'job-2',
      data: {
        exportId: 'exp-json',
        userId: 'u-2',
        title: 'Custom Data',
        format: 'json',
        datasetType: 'custom',
        records: customRecords,
        requestedAt: new Date().toISOString(),
      } as ExportRequestPayload,
    } as unknown as Job<ExportRequestPayload, any, string>;

    const result = await processor.process(mockJob);

    expect(result.format).toBe('json');
    expect(exportsServiceMock.fetchDataset).not.toHaveBeenCalled();
    expect(s3StorageServiceMock.uploadFile).toHaveBeenCalledWith(
      expect.any(String),
      'exports/u-2/exp-json.json',
      expect.any(Buffer),
      'application/json',
    );
  });

  it('debe manejar errores, marcar fallo en Redis y emitir EXPORT_FAILED por WebSocket', async () => {
    s3StorageServiceMock.uploadFile.mockRejectedValue(new Error('S3 Storage Error'));

    const mockJob = {
      id: 'job-fail',
      data: {
        exportId: 'exp-err',
        userId: 'u-3',
        title: 'Error Report',
        format: 'csv',
        datasetType: 'users',
        requestedAt: new Date().toISOString(),
      } as ExportRequestPayload,
    } as unknown as Job<ExportRequestPayload, any, string>;

    await expect(processor.process(mockJob)).rejects.toThrow('S3 Storage Error');

    expect(exportsServiceMock.updateExportStatus).toHaveBeenCalledWith(
      'exp-err',
      expect.objectContaining({ status: 'failed', error: 'S3 Storage Error' }),
    );

    expect(notificationGatewayMock.sendToUser).toHaveBeenCalledWith(
      'u-3',
      expect.objectContaining({
        type: 'EXPORT_FAILED',
        exportId: 'exp-err',
        error: 'S3 Storage Error',
      }),
    );
  });
});

