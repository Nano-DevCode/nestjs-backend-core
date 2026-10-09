import { Test, TestingModule } from '@nestjs/testing';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

describe('AlertsController', () => {
  let controller: AlertsController;
  let service: AlertsService;

  const mockAlertsService = {
    sendAlert: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertsController],
      providers: [
        {
          provide: AlertsService,
          useValue: mockAlertsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AlertsController>(AlertsController);
    service = module.get<AlertsService>(AlertsService);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('sendTestAlert debe retornar mensaje afirmativo cuando se despacha con éxito', async () => {
    mockAlertsService.sendAlert.mockResolvedValue(true);

    const result = await controller.sendTestAlert({
      title: 'Prueba',
      message: 'Mensaje de prueba',
      severity: 'info',
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('Alerta despachada correctamente');
    expect(service.sendAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Prueba',
        message: 'Mensaje de prueba',
        severity: 'info',
        source: 'Admin Test Panel',
      }),
    );
  });

  it('sendTestAlert debe retornar mensaje alternativo cuando no hay webhooks externos configurados', async () => {
    mockAlertsService.sendAlert.mockResolvedValue(false);

    const result = await controller.sendTestAlert({
      title: 'Prueba 2',
      message: 'Mensaje de prueba 2',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Alerta procesada localmente');
  });
});

