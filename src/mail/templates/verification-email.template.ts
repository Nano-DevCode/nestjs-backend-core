import type { EmailTemplateResult } from './password-reset.template';

export interface VerificationEmailTemplateParams {
  name?: string;
  verificationUrl: string;
}

export function getVerificationEmailTemplate(
  params: VerificationEmailTemplateParams,
): EmailTemplateResult {
  const greeting = params.name ? `Hola, ${params.name}` : 'Hola';
  const subject = 'Verificación de cuenta';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #2c3e50;">Verifica tu Cuenta</h2>
      <p>${greeting}:</p>
      <p>Gracias por registrarte. Por favor confirma tu dirección de correo haciendo clic en el siguiente enlace:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${params.verificationUrl}" style="background-color: #2ecc71; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Confirmar Cuenta</a>
      </div>
      <p style="color: #7f8c8d; font-size: 13px;">Si no reconoces esta cuenta, ignora este correo.</p>
    </div>
  `;
  const text = `${greeting}. Verifica tu cuenta accediendo a: ${params.verificationUrl}`;

  return {
    subject,
    html,
    text,
  };
}
