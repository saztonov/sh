import dotenv from 'dotenv';

// Load .env from monorepo root (CWD is apps/scraper when running via workspace)
dotenv.config({ path: '../../.env' });
dotenv.config(); // also try CWD for standalone runs

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export const config = {
  supabase: {
    url: requireEnv('SUPABASE_URL'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  },
  s3: {
    endpoint: requireEnv('S3_ENDPOINT'),
    region: optionalEnv('S3_REGION', 'ru-central-1'),
    bucket: requireEnv('S3_BUCKET'),
    tenantId: requireEnv('S3_TENANT_ID'),
    accessKeyId: requireEnv('S3_ACCESS_KEY'),
    secretAccessKey: requireEnv('S3_SECRET_KEY'),
    publicUrl: optionalEnv('S3_PUBLIC_URL', ''),
  },
  scrape: {
    cron: optionalEnv('SCRAPE_CRON', '0 7,14,20 * * 1-5'),
    pollIntervalMs: 30_000,
  },
  playwright: {
    statePath: optionalEnv('PLAYWRIGHT_STATE_PATH', './playwright-state.json'),
    headless: optionalEnv('PLAYWRIGHT_HEADLESS', 'true') === 'true',
    channel: optionalEnv('BROWSER_CHANNEL', ''),
  },
  google: {
    email: process.env.GOOGLE_EMAIL ?? '',
    password: process.env.GOOGLE_PASSWORD ?? '',
  },
  eljur: {
    vendor: process.env.ELJUR_VENDOR ?? '',
    login: process.env.ELJUR_LOGIN ?? '',
    password: process.env.ELJUR_PASSWORD ?? '',
    statePath: optionalEnv('ELJUR_STATE_PATH', './state/eljur_state.json'),
  },
} as const;

export type Config = typeof config;
