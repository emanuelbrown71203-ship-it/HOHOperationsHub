import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDemoClient } from './demo';

/** Demo builds run entirely in the browser with sample data (see demo.ts). */
export const isDemo = import.meta.env.VITE_DEMO === '1';

// The URL and publishable key are designed to be public; data is protected by
// row-level security in the database. Override them with a .env file if needed.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://khtuqripoqqlzqdkrwym.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_1EAvSGBR7VnFG8J06UxUJg_yCDJkkLL';

export const supabase: SupabaseClient = isDemo
  ? (createDemoClient() as unknown as SupabaseClient)
  : createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });

export function errorMessage(err: unknown): string {
  if (!err) return 'Something went wrong';
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err && 'message' in err) return String((err as { message: unknown }).message);
  return 'Something went wrong';
}
