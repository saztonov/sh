import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env from monorepo root (CWD is apps/api when running via workspace)
dotenv.config({ path: '../../.env' });
dotenv.config(); // also try CWD for standalone runs

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_TENANT_ID: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

export type Config = z.infer<typeof envSchema>;
