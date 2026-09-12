export type MailDriver = 'smtp' | 'oauth2';

export interface MailJobData {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface PasswordResetJobData {
  to: string;
  name?: string;
  resetToken: string;
  resetUrl: string;
}

export interface VerificationJobData {
  to: string;
  name?: string;
  verificationToken: string;
  verificationUrl: string;
}
