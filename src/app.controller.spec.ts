import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FeatureFlagsService } from './features/feature-flags.service';

describe('AppController', () => {
  let controller: AppController;
  let appService: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: FeatureFlagsService,
          useValue: { isEnabled: jest.fn().mockReturnValue(true) },
        },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
    appService = module.get<AppService>(AppService);
  });

  describe('getHello', () => {
    it('debe retornar "Hello World!" llamando al AppService', () => {
      const spy = jest.spyOn(appService, 'getHello').mockReturnValue('Hello World!');
      expect(controller.getHello()).toBe('Hello World!');
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('getBetaFeature', () => {
    it('debe retornar { ok: true }', () => {
      expect(controller.getBetaFeature()).toEqual({ ok: true });
    });
  });
});
