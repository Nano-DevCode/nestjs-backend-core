import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { UserAuthContext } from '../auth/interfaces/auth.interface';

describe('ExportsController', () => {
  let controller: ExportsController;
  let service: ExportsService;

  const mockExportsService = {
    requestExport: jest.fn(),
    getExportStatus: jest.fn(),
  };

  const mockUser: UserAuthContext = {
    id: 'user-xyz',
    email: 'user@example.com',
    role: 'USER',
    name: 'User Test',
    isActive: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExportsController],
      providers: [
        {
          provide: ExportsService,
          useValue: mockExportsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ExportsController>(ExportsController);
    service = module.get<ExportsService>(ExportsService);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('requestExport debe encolar la exportación para el usuario autenticado', async () => {
    const expectedResponse = {
      exportId: 'exp-99',
      status: 'pending',
      queueJobId: 'job-1',
    };
    mockExportsService.requestExport.mockResolvedValue(expectedResponse);

    const result = await controller.requestExport(mockUser, {
      title: 'Mi Exportación',
      format: 'csv',
      datasetType: 'users',
    });

    expect(result).toEqual(expectedResponse);
    expect(service.requestExport).toHaveBeenCalledWith(
      'user-xyz',
      expect.objectContaining({ format: 'csv', datasetType: 'users' }),
    );
  });

  it('getStatus debe retornar el estado si existe', async () => {
    const statusData = {
      exportId: 'exp-99',
      status: 'completed',
      fileUrl: '/api/files/view/exp-99.csv',
    };
    mockExportsService.getExportStatus.mockResolvedValue(statusData);

    const result = await controller.getStatus('exp-99');
    expect(result).toEqual(statusData);
    expect(service.getExportStatus).toHaveBeenCalledWith('exp-99');
  });

  it('getStatus debe lanzar NotFoundException si la exportación no existe', async () => {
    mockExportsService.getExportStatus.mockResolvedValue(null);

    await expect(controller.getStatus('exp-inexistente')).rejects.toThrow(
      NotFoundException,
    );
  });
});

