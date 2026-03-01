/** Base URL for API requests. Empty string means use Vite dev proxy. */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL || '';

/** Supabase project URL */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || '';

/** Supabase anonymous key for client-side auth */
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
