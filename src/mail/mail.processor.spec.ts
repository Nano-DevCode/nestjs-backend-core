import { Test, TestingModule } from '@nestjs/testing';
import { MailProcessor } from './mail.processor';
import { MAIL_JOBS } from './mail.constants';
import * as nodemailer from 'nodemailer';
import type { Job } from 'bullmq';

describe('MailProcessor', () => {
  let processor: MailProcessor;
  let sendMailMock: jest.Mock;

  beforeEach(async () => {
    sendMailMock = jest.fn().mockResolvedValue({ messageId: 'msg-123' });
    jest.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: sendMailMock,
    } as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [MailProcessor],
    }).compile();

    processor = module.get<MailProcessor>(MailProcessor);
    processor.onModuleInit();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('debe procesar trabajo de verificación de correo', async () => {
    const job = {
      id: 'job-1',
      name: MAIL_JOBS.VERIFICATION,
      attemptsMade: 0,
      data: {
        to: 'verify@example.com',
        name: 'User 1',
        verificationToken: 'v-1',
        verificationUrl: 'http://app/v?tok=1',
      },
    } as Job<any, void, string>;

    await processor.process(job);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'verify@example.com',
        subject: 'Verificación de cuenta',
      }),
    );
  });

  it('debe procesar trabajo de reseteo de contraseña', async () => {
    const job = {
      id: 'job-2',
      name: MAIL_JOBS.PASSWORD_RESET,
      attemptsMade: 0,
      data: {
        to: 'reset@example.com',
        resetToken: 'rst-1',
        resetUrl: 'http://app/r?tok=1',
      },
    } as Job<any, void, string>;

    await processor.process(job);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'reset@example.com',
        subject: 'Restablecimiento de contraseña',
      }),
    );
  });

  it('debe procesar trabajo de correo personalizado', async () => {
    const job = {
      id: 'job-3',
      name: MAIL_JOBS.CUSTOM,
      attemptsMade: 0,
      data: {
        to: 'custom@example.com',
        subject: 'Custom Subject',
        html: '<p>Hello</p>',
      },
    } as Job<any, void, string>;

    await processor.process(job);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'custom@example.com',
        subject: 'Custom Subject',
      }),
    );
  });
});
