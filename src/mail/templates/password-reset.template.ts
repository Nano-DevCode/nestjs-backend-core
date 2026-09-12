export interface PasswordResetTemplateParams {
  name?: string;
  resetUrl: string;
}

export interface EmailTemplateResult {
  subject: string;
  html: string;
  text: string;
}

export function getPasswordResetTemplate(
  params: PasswordResetTemplateParams,
): EmailTemplateResult {
  const greeting = params.name ? `Hola, ${params.name}` : 'Hola';
  const subject = 'Restablecimiento de contraseña';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #2c3e50;">Restablecimiento de Contraseña</h2>
      <p>${greeting}:</p>
      <p>Hemos recibido una solicitud para restablecer tu contraseña. Haz clic en el botón siguiente para proceder:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${params.resetUrl}" style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Restablecer Contraseña</a>
      </div>
      <p style="color: #7f8c8d; font-size: 13px;">Si no solicitaste este cambio, puedes ignorar este mensaje de forma segura.</p>
    </div>
  `;
  const text = `${greeting}. Restablece tu contraseña accediendo al siguiente enlace: ${params.resetUrl}`;

  return {
    subject,
    html,
    text,
  };
}
