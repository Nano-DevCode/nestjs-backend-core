export const MAIL_QUEUE = 'mail-queue';

export const MAIL_JOBS = {
  PASSWORD_RESET: 'send-password-reset',
  VERIFICATION: 'send-verification',
  CUSTOM: 'send-custom',
} as const;
