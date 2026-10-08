import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { StreamableFile } from '@nestjs/common';
import { PdfController } from './pdf.controller';
import { PdfGeneratorService } from '../services/pdf-generator.service';
import { PDF_QUEUE, PDF_JOBS } from '../pdf.constants';
import type { UserAuthContext } from '../../auth/interfaces/auth.interface';

describe('PdfController', () => {
  let controller: PdfController;
  let queueMock: { add: jest.Mock };
  let pdfServiceMock: { generatePdf: jest.Mock };

  const mockUser: UserAuthContext = {
    id: 'user-1',
    email: 'user@example.com',
    roles: ['user'],
    permissions: [],
    isTwoFactorEnabled: false,
  };

  beforeEach(async () => {
    queueMock = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
    };

    pdfServiceMock = {
      generatePdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock')),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PdfController],
      providers: [
        { provide: getQueueToken(PDF_QUEUE), useValue: queueMock },
        { provide: PdfGeneratorService, useValue: pdfServiceMock },
      ],
    }).compile();

    controller = module.get<PdfController>(PdfController);
  });

  describe('generateAsync', () => {
    it('debe encolar un trabajo de generación en BullMQ', async () => {
      const dto = {
        templateName: 'invoice',
        data: { amount: 100 },
        filename: 'invoice.pdf',
      };

      const res = await controller.generateAsync(mockUser, dto);

      expect(queueMock.add).toHaveBeenCalledWith(
        PDF_JOBS.GENERATE,
        expect.objectContaining({
          templateName: 'invoice',
          userId: 'user-1',
        }),
        expect.any(Object),
      );
      expect(res.jobId).toBe('job-123');
    });
  });

  describe('previewSync', () => {
    it('debe generar y retornar un StreamableFile para vista previa inmediata', async () => {
      const dto = { templateName: 'certificate', data: { name: 'Juan' } };

      const file = await controller.previewSync(dto);

      expect(pdfServiceMock.generatePdf).toHaveBeenCalledWith(
        'certificate',
        { name: 'Juan' },
      );
      expect(file).toBeInstanceOf(StreamableFile);
    });
  });
});

