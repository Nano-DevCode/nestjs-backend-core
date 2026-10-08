import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { MailService } from './mail.service';
import { MAIL_QUEUE, MAIL_JOBS } from './mail.constants';

describe('MailService', () => {
  let service: MailService;
  let queueMock: { add: jest.Mock };

  beforeEach(async () => {
    queueMock = {
      add: jest.fn().mockResolvedValue({ id: 'mail-job-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: getQueueToken(MAIL_QUEUE), useValue: queueMock },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  it('debe encolar correo de restablecimiento de contraseña', async () => {
    const data = {
      to: 'user@example.com',
      resetToken: 'rst-123',
      resetUrl: 'http://app/reset?token=rst-123',
    };

    await service.sendPasswordResetEmail(data);

    expect(queueMock.add).toHaveBeenCalledWith(
      MAIL_JOBS.PASSWORD_RESET,
      data,
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('debe encolar correo de verificación de cuenta', async () => {
    const data = {
      to: 'verify@example.com',
      verificationToken: 'v-123',
      verificationUrl: 'http://app/verify?token=v-123',
    };

    await service.sendVerificationEmail(data);

    expect(queueMock.add).toHaveBeenCalledWith(
      MAIL_JOBS.VERIFICATION,
      data,
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('debe encolar correo general', async () => {
    const data = {
      to: 'custom@example.com',
      subject: 'Hola',
      text: 'Mensaje',
    };

    await service.sendMail(data);

    expect(queueMock.add).toHaveBeenCalledWith(
      MAIL_JOBS.CUSTOM,
      data,
      expect.objectContaining({ attempts: 3 }),
    );
  });
});

