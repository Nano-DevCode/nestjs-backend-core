import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;

  beforeEach(() => {
    service = new AppService();
  });

  it('debe retornar "Hello World!"', () => {
    expect(service.getHello()).toBe('Hello World!');
  });
});
