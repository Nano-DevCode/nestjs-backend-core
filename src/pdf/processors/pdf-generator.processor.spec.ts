import { Test, TestingModule } from '@nestjs/testing';
import { PdfGeneratorProcessor } from './pdf-generator.processor';
import { PdfGeneratorService } from '../services/pdf-generator.service';
import { S3StorageService } from '../../files/services/s3-storage.service';
import { NotificationsService } from '../../notifications/notifications.service';
import type { Job } from 'bullmq';

describe('PdfGeneratorProcessor', () => {
  let processor: PdfGeneratorProcessor;
  let pdfGeneratorServiceMock: { generatePdf: jest.Mock };
  let s3StorageServiceMock: { uploadFile: jest.Mock };
  let notificationsServiceMock: { createNotification: jest.Mock };

  beforeEach(async () => {
    pdfGeneratorServiceMock = {
      generatePdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock pdf buffer')),
    };

    s3StorageServiceMock = {
      uploadFile: jest.fn().mockResolvedValue('https://storage/doc.pdf'),
    };

    notificationsServiceMock = {
      createNotification: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfGeneratorProcessor,
        { provide: PdfGeneratorService, useValue: pdfGeneratorServiceMock },
        { provide: S3StorageService, useValue: s3StorageServiceMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
      ],
    }).compile();

    processor = module.get<PdfGeneratorProcessor>(PdfGeneratorProcessor);
  });

  it('debe generar el PDF, subirlo a S3 y notificar al usuario', async () => {
    const job = {
      id: 'job-999',
      name: 'generate_pdf',
      data: {
        templateName: 'invoice',
        data: { total: 500 },
        filename: 'invoice-999',
        userId: 'user-77',
      },
    } as Job<any, void, string>;

    await processor.process(job);

    expect(pdfGeneratorServiceMock.generatePdf).toHaveBeenCalledWith(
      'invoice',
      { total: 500 },
    );
    expect(s3StorageServiceMock.uploadFile).toHaveBeenCalled();
    expect(notificationsServiceMock.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-77',
        title: expect.stringContaining('PDF listo'),
      }),
    );
  });
});

