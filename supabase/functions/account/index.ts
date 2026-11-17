// Account help for passkey sign-in (the passkeys themselves are handled by Supabase Auth):
//   signup          create an account from just a name, so the person can add a passkey right away
//   code-redeem     sign in with a one-time code a director gave you, to set up a passkey on a new device
//   code-create     (directors) make a one-time sign-in code for someone
//   team            (directors) how each person signs in: email and/or number of passkeys
//   remove-passkeys (directors) remove someone's passkeys, for example from a lost phone
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

// Accounts made without an email get a placeholder address that is never shown or emailed.
const PASSKEY_EMAIL_DOMAIN = 'passkey.invalid';
// No look-alike characters (0/O, 1/I/L).
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
function newCode() {
  const chars = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}
const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
const randomSecret = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

/** A one-time token the app exchanges for a session (no email is sent). */
async function sessionToken(admin: SupabaseClient, email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !data?.properties?.hashed_token) throw new Error(error?.message ?? 'Could not sign in');
  return data.properties.hashed_token;
}

async function director(admin: SupabaseClient, req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data } = await admin.auth.getUser(token);
  if (!data?.user) return null;
  const { data: me } = await admin.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  return me?.role === 'director' ? data.user : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  try {
    switch (body.action) {
      case 'signup': {
        const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
        if (!name || name.length > 60) return json({ error: 'Enter your name (up to 60 characters).' }, 400);
        const email = `${crypto.randomUUID()}@${PASSKEY_EMAIL_DOMAIN}`;
        const { error } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          password: randomSecret(),
          user_metadata: { full_name: name, signs_in_with: 'passkey' },
        });
        if (error) return json({ error: error.message }, 400);
        return json({ token_hash: await sessionToken(admin, email) });
      }

      case 'code-redeem': {
        const code = normalizeCode(String(body.code ?? ''));
        if (code.length !== 8) {
          await sleep(400);
          return json({ error: "That code doesn't look right. It has 8 letters and numbers." }, 400);
        }
        const { data: row } = await admin
          .from('signin_codes')
          .select('*')
          .eq('code_hash', await sha256(code))
          .is('used_at', null)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();
        if (!row) {
          await sleep(700); // slows down guessing
          return json({ error: 'That code is wrong, expired or already used. Ask a director for a new one.' }, 400);
        }
        await admin.from('signin_codes').update({ used_at: new Date().toISOString() }).eq('id', row.id);
        const { data: u } = await admin.auth.admin.getUserById(row.user_id);
        if (!u?.user?.email) return json({ error: 'That account was not found.' }, 404);
        const { data: profile } = await admin.from('profiles').select('full_name').eq('id', row.user_id).maybeSingle();
        return json({ token_hash: await sessionToken(admin, u.user.email), name: profile?.full_name ?? null });
      }

      case 'code-create': {
        const me = await director(admin, req);
        if (!me) return json({ error: 'Only directors can make sign-in codes.' }, 403);
        const userId = String(body.userId ?? '');
        const { data: target } = await admin.from('profiles').select('id, full_name').eq('id', userId).maybeSingle();
        if (!target) return json({ error: 'That account was not found.' }, 404);
        await admin.from('signin_codes').delete().eq('user_id', userId).is('used_at', null); // one live code per person
        const code = newCode();
        const { data: row, error } = await admin
          .from('signin_codes')
          .insert({ user_id: userId, code_hash: await sha256(normalizeCode(code)), created_by: me.id })
          .select('expires_at')
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ code, expires_at: row.expires_at, name: target.full_name });
      }

      case 'team': {
        if (!(await director(admin, req))) return json({ error: 'Only directors can see this.' }, 403);
        const { data: people } = await admin.from('profiles').select('id');
        const result = await Promise.all(
          (people ?? []).map(async (p: { id: string }) => {
            const { data: u } = await admin.auth.admin.getUserById(p.id);
            const email = u?.user?.email ?? null;
            const realEmail = email && !email.endsWith(`@${PASSKEY_EMAIL_DOMAIN}`) ? email : null;
            let passkeys: number | null = null;
            try {
              const { data, error } = await admin.auth.admin.passkey.listPasskeys({ userId: p.id });
              if (!error) passkeys = data?.length ?? 0;
            } catch {
              /* passkeys switched off */
            }
            return { userId: p.id, email: realEmail, passkeys };
          }),
        );
        return json({ people: result });
      }

      case 'remove-passkeys': {
        if (!(await director(admin, req))) return json({ error: 'Only directors can remove passkeys.' }, 403);
        const userId = String(body.userId ?? '');
        const { data, error } = await admin.auth.admin.passkey.listPasskeys({ userId });
        if (error) return json({ error: error.message }, 400);
        for (const pk of data ?? []) await admin.auth.admin.passkey.deletePasskey({ userId, passkeyId: pk.id });
        return json({ removed: (data ?? []).length });
      }

      default:
        return json({ error: 'Unknown action.' }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Something went wrong.' }, 500);
  }
});
