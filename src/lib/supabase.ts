import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDemoClient } from './demo';

/** Demo builds run entirely in the browser with sample data (see demo.ts). */
export const isDemo = import.meta.env.VITE_DEMO === '1';

// The URL and publishable key are designed to be public; data is protected by
// row-level security in the database. Override them with a .env file if needed.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://khtuqripoqqlzqdkrwym.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_1EAvSGBR7VnFG8J06UxUJg_yCDJkkLL';

/* ---- Safety net for "View the app as…" ----
   While an admin previews another role, every request that would save or change data is refused here
   (reads still work), so no screen can log anything under the wrong name. Database functions that only
   read must be listed in READ_ONLY_FUNCTIONS, or they will be refused during a preview. */
const READ_ONLY_FUNCTIONS = new Set(['leaderboard', 'my_points', 'lead_points_by_shift', 'lead_of_month']);
let previewLabel: string | null = null;
export function setPreviewGuard(label: string | null) {
  previewLabel = label;
}
function refusedInPreview(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method === 'GET' || method === 'HEAD') return false;
  const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
  const fn = path.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)/)?.[1];
  if (fn) return !READ_ONLY_FUNCTIONS.has(fn);
  if (path.startsWith('/rest/v1/')) return true;
  // Server functions send notifications or change accounts.
  if (path.startsWith('/functions/v1/')) return true;
  // Photo uploads and deletes (signed links for viewing photos are reads).
  return path.startsWith('/storage/v1/object') && !/^\/storage\/v1\/object\/(sign|list|info|public|authenticated)\//.test(path);
}
const guardedFetch: typeof fetch = (input, init) => {
  if (previewLabel && refusedInPreview(input, init)) {
    const message = `You’re viewing the app as ${previewLabel}. Exit the preview to log or change things.`;
    return Promise.resolve(new Response(JSON.stringify({ message, error: message, code: 'preview' }), { status: 403, headers: { 'content-type': 'application/json' } }));
  }
  return fetch(input, init);
};

export const supabase: SupabaseClient = isDemo
  ? (createDemoClient() as unknown as SupabaseClient)
  : createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true }, global: { fetch: guardedFetch } });

export function errorMessage(err: unknown): string {
  if (!err) return 'Something went wrong';
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err && 'message' in err) return String((err as { message: unknown }).message);
  return 'Something went wrong';
}
