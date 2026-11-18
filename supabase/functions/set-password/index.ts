// Lets an admin set a temporary password for someone on the team, so nobody is locked
// out when password-reset emails can't be delivered. The person can change it in Account.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Who is asking? (The signed-in user's own session token.)
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) return json({ error: 'Sign in again, then retry.' }, 401);

  const { data: me } = await admin.from('profiles').select('role, is_admin').eq('id', userData.user.id).maybeSingle();
  if (!me?.is_admin || me.role === 'pending') return json({ error: 'Only admins can set passwords for other people.' }, 403);

  let body: { userId?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  const userId = typeof body.userId === 'string' ? body.userId : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!userId) return json({ error: 'Choose whose password to set.' }, 400);
  if (password.length < 6) return json({ error: 'Use at least 6 characters.' }, 400);

  const { data: target } = await admin.from('profiles').select('id, full_name').eq('id', userId).maybeSingle();
  if (!target) return json({ error: 'That account was not found.' }, 404);

  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true, name: target.full_name });
});
