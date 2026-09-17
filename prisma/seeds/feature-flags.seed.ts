import { type PrismaClient, Prisma } from '../generated/prisma/client';

export interface CoreFeatureFlagDefinition {
  key: string;
  description: string;
  isEnabled: boolean;
  rules?: {
    allowedUsers?: string[];
    allowedRoles?: string[];
    percentage?: number;
  };
}

export const CORE_FEATURE_FLAGS: CoreFeatureFlagDefinition[] = [
  {
    key: 'DISCORD_BOT_ENABLED',
    description: 'Módulo del bot de música en Discord y orquestación con Lavalink v4.',
    isEnabled: true,
    rules: { percentage: 100, allowedRoles: ['admin', 'user'] },
  },
  {
    key: 'BETA_FEATURE',
    description: 'Acceso anticipado a endpoints y herramientas experimentales con verificación @RequireFeature.',
    isEnabled: true,
    rules: { percentage: 100, allowedRoles: ['admin', 'user'] },
  },
  {
    key: 'DARK_MODE_V2',
    description: 'Motor de temas visuales dinámicos con soporte OLED y gradientes reactivos.',
    isEnabled: true,
    rules: { percentage: 100 },
  },
  {
    key: 'S3_MULTIPART_V2',
    description: 'Subida paralela por fragmentos (chunks) para archivos pesados mayores a 50 MB.',
    isEnabled: false,
    rules: { percentage: 0, allowedRoles: ['admin'] },
  },
  {
    key: 'OAUTH_SOCIAL_LOGIN',
    description: 'Autenticación social federada (Master Switch).',
    isEnabled: true,
    rules: { percentage: 100 },
  },
  {
    key: 'OAUTH_GOOGLE',
    description: 'Inicio de sesión social con Google OAuth2.',
    isEnabled: true,
    rules: { percentage: 100 },
  },
  {
    key: 'OAUTH_FACEBOOK',
    description: 'Inicio de sesión social con Facebook Login.',
    isEnabled: true,
    rules: { percentage: 100 },
  },
];

export async function seedFeatureFlags(prisma: PrismaClient): Promise<void> {
  console.log('🚩 Verificando / sembrando Feature Flags del sistema...');

  for (const flag of CORE_FEATURE_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      update: {
        description: flag.description,
      },
      create: {
        key: flag.key,
        description: flag.description,
        isEnabled: flag.isEnabled,
        rules: flag.rules ? (flag.rules as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }

  console.log(`✅ ${CORE_FEATURE_FLAGS.length} Feature Flags verificadas en base de datos.`);
}
