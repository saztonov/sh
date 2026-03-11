import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const config = {
  supabase: {
    url: requireEnv('SUPABASE_URL'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  },
  telegram: {
    botToken: requireEnv('TELEGRAM_BOT_TOKEN'),
    adminId: parseInt(requireEnv('TELEGRAM_ADMIN_ID'), 10),
  },
  ai: {
    provider: (process.env['AI_PROVIDER'] ?? 'cerebras') as 'cerebras' | 'google' | 'groq',
    model: optionalEnv('AI_MODEL'),
    cerebrasApiKey: optionalEnv('CEREBRAS_API_KEY'),
    googleApiKey: optionalEnv('GOOGLE_AI_API_KEY'),
    groqApiKey: optionalEnv('GROQ_API_KEY'),
  },
} as const;

export type Config = typeof config;
