import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { AuditQueryService } from './audit-query.service';
import { Reflector } from '@nestjs/core';

describe('AuditController', () => {
  let controller: AuditController;
  let queryServiceMock: {
    findAll: jest.Mock;
    findById: jest.Mock;
  };

  beforeEach(async () => {
    queryServiceMock = {
      findAll: jest.fn().mockResolvedValue({ audits: [], total: 0 }),
      findById: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        {
          provide: AuditQueryService,
          useValue: queryServiceMock,
        },
        {
          provide: Reflector,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<AuditController>(AuditController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('debe delegar findAll al servicio de consultas', async () => {
    const query = { page: 1, limit: 10 };
    await controller.findAll(query);
    expect(queryServiceMock.findAll).toHaveBeenCalledWith(query);
  });

  it('debe delegar findById al servicio de consultas', async () => {
    await controller.findById('audit-1');
    expect(queryServiceMock.findById).toHaveBeenCalledWith('audit-1');
  });
});

