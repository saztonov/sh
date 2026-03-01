import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config.js';

/** Supabase client using the service role key (bypasses RLS). */
export const supabase: SupabaseClient = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
);
