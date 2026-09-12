import { Logger, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { MAIL_QUEUE, MAIL_JOBS } from './mail.constants';
import type {
  MailJobData,
  PasswordResetJobData,
  VerificationJobData,
  MailDriver,
} from './interfaces/mail.interface';

import {
  getPasswordResetTemplate,
  getVerificationEmailTemplate,
} from './templates';

@Processor(MAIL_QUEUE)
export class MailProcessor
  extends WorkerHost
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(MailProcessor.name);
  private transporter!: Transporter;

  onModuleInit() {
    this.setupTransporter();
  }

  async onApplicationShutdown() {
    this.logger.log(
      'Cerrando worker de correos BullMQ y esperando finalización de trabajos en curso...',
    );
    try {
      await this.worker.close();
      this.logger.log('Worker de BullMQ cerrado limpiamente.');
    } catch (error) {
      this.logger.error(
        `Error durante el cierre del worker de BullMQ: ${(error as Error).message}`,
      );
    }
  }

  private setupTransporter() {
    const driver: MailDriver =
      (process.env.MAIL_DRIVER?.toLowerCase() as MailDriver) || 'smtp';
    const sender = process.env.MAIL_FROM || '"Sistema" <no-reply@sistema.com>';

    this.logger.log(`Inicializando transporte de correo con driver: ${driver}`);

    if (driver === 'oauth2') {
      const user = process.env.MAIL_USER;
      const clientId = process.env.MAIL_CLIENT_ID;
      const clientSecret = process.env.MAIL_CLIENT_SECRET;
      const refreshToken = process.env.MAIL_REFRESH_TOKEN;

      if (!user || !clientId || !clientSecret || !refreshToken) {
        this.logger.warn(
          'Configuración OAuth2 incompleta (MAIL_USER, MAIL_CLIENT_ID, MAIL_CLIENT_SECRET, MAIL_REFRESH_TOKEN). Verifique las variables de entorno.',
        );
      }

      this.transporter = nodemailer.createTransport(
        {
          service: process.env.MAIL_SERVICE || 'gmail',
          auth: {
            type: 'OAuth2',
            user: user || 'no-reply@sistema.com',
            clientId: clientId || '',
            clientSecret: clientSecret || '',
            refreshToken: refreshToken || '',
          },
        },
        {
          from: sender,
        },
      );
    } else {
      // Modo por defecto: SMTP (ej. App Password de Gmail)
      const host = process.env.MAIL_HOST || 'smtp.gmail.com';
      const port = Number(process.env.MAIL_PORT) || 587;
      const secure = process.env.MAIL_SECURE === 'true' || port === 465;
      const user = process.env.MAIL_USER;
      const pass = process.env.MAIL_PASS;

      if (!user || !pass) {
        this.logger.warn(
          'Credenciales SMTP no configuradas (MAIL_USER o MAIL_PASS ausente). El envío de correos fallará en entorno real.',
        );
      }

      this.transporter = nodemailer.createTransport(
        {
          host,
          port,
          secure,
          auth: {
            user: user || 'no-reply@sistema.com',
            pass: pass || '',
          },
        },
        {
          from: sender,
        },
      );
    }
  }

  async process(job: Job<unknown, void, string>): Promise<void> {
    this.logger.log(
      `Procesando trabajo ${job.id} [${job.name}] (Intento #${job.attemptsMade + 1})`,
    );

    try {
      switch (job.name) {
        case MAIL_JOBS.PASSWORD_RESET:
          await this.handlePasswordReset(job.data as PasswordResetJobData);
          break;

        case MAIL_JOBS.VERIFICATION:
          await this.handleVerification(job.data as VerificationJobData);
          break;

        case MAIL_JOBS.CUSTOM:
          await this.handleCustomMail(job.data as MailJobData);
          break;

        default:
          this.logger.warn(`Trabajo desconocido recibido: ${job.name}`);
      }

      this.logger.log(
        `Trabajo ${job.id} [${job.name}] completado exitosamente`,
      );
    } catch (error) {
      const errMessage =
        error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(
        `Error al procesar trabajo ${job.id} [${job.name}]: ${errMessage}`,
      );
      // Relanza el error para que BullMQ active el reintento automático con backoff exponencial
      throw error;
    }
  }

  private async handlePasswordReset(data: PasswordResetJobData): Promise<void> {
    const template = getPasswordResetTemplate({
      name: data.name,
      resetUrl: data.resetUrl,
    });

    await this.transporter.sendMail({
      to: data.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  private async handleVerification(data: VerificationJobData): Promise<void> {
    const template = getVerificationEmailTemplate({
      name: data.name,
      verificationUrl: data.verificationUrl,
    });

    await this.transporter.sendMail({
      to: data.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  private async handleCustomMail(data: MailJobData): Promise<void> {
    await this.transporter.sendMail({
      to: data.to,
      subject: data.subject,
      text: data.text,
      html: data.html,
    });
  }
}
