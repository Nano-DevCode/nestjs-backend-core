import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MAIL_QUEUE, MAIL_JOBS } from './mail.constants';
import type {
  MailJobData,
  PasswordResetJobData,
  VerificationJobData,
} from './interfaces/mail.interface';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(@InjectQueue(MAIL_QUEUE) private readonly mailQueue: Queue) {}

  private readonly defaultJobOptions = {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  };

  async sendPasswordResetEmail(data: PasswordResetJobData): Promise<void> {
    this.logger.log(
      `Encolando correo de restablecimiento de contraseña para: ${data.to}`,
    );
    await this.mailQueue.add(
      MAIL_JOBS.PASSWORD_RESET,
      data,
      this.defaultJobOptions,
    );
  }

  async sendVerificationEmail(data: VerificationJobData): Promise<void> {
    this.logger.log(`Encolando correo de verificación para: ${data.to}`);
    await this.mailQueue.add(
      MAIL_JOBS.VERIFICATION,
      data,
      this.defaultJobOptions,
    );
  }

  async sendMail(data: MailJobData): Promise<void> {
    this.logger.log(`Encolando correo general para: ${data.to}`);
    await this.mailQueue.add(MAIL_JOBS.CUSTOM, data, this.defaultJobOptions);
  }
}
