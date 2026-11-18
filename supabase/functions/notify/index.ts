// Phone notifications for HOH Leads.
//   schedule-posted : tells each scheduled lead (and only them) which shifts they have
//   reminders       : run every 10 minutes by the database; reminds the lead on duty an hour before their shift
//   test            : sends a test notification to the caller's own devices
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const APP_URL = 'https://hoh-operations-hub.vercel.app';
const REMIND_MINUTES = 60;

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
type Payload = { title: string; body: string; url?: string; tag?: string };

function localNow(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}
function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'numeric', day: 'numeric' });
const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '');

    const { data: cfg } = await admin.rpc('push_config');
    if (!cfg?.vapid_private) return json({ error: 'Notifications are not set up for this store yet.' }, 500);
    webpush.setVapidDetails(APP_URL, cfg.vapid_public, cfg.vapid_private);

    const { data: settings } = await admin.from('app_settings').select('notifications_enabled, timezone, shifts').eq('id', 1).single();
    const enabled = !!settings?.notifications_enabled;

    /** Sends to every device of these accounts; returns the accounts that got at least one. */
    async function sendTo(userIds: string[], payload: Payload) {
      const reached = new Set<string>();
      if (userIds.length === 0) return reached;
      const { data: subs } = await admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', userIds);
      await Promise.all(((subs as Sub[]) ?? []).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 6 * 3600 });
          reached.add(s.user_id);
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          // The phone removed the app or turned notifications off: forget that device.
          if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', s.id);
          else console.error('push failed', status, (e as Error).message);
        }
      }));
      return reached;
    }

    /* ---- every 10 minutes, from the database ---- */
    if (action === 'reminders') {
      if (req.headers.get('x-cron-secret') !== cfg.cron_secret) return json({ error: 'Not allowed' }, 403);
      if (!enabled) return json({ ok: true, skipped: 'notifications are off' });
      const now = localNow(settings!.timezone || 'America/New_York');
      const shifts = (settings!.shifts ?? []) as { name: string; start: string }[];
      let sent = 0;
      for (const s of shifts) {
        const [h, m] = s.start.split(':').map(Number);
        const start = h * 60 + (m || 0);
        let date: string | null = null;
        if (start - now.minutes >= 0 && start - now.minutes <= REMIND_MINUTES) date = now.date;
        else if (start + 1440 - now.minutes <= REMIND_MINUTES) date = addDays(now.date, 1);
        if (!date) continue;
        const { data: rows } = await admin
          .from('shift_schedule').select('id, hoh_leads(name, profile_id)')
          .eq('shift_date', date).eq('shift', s.name).is('reminded_at', null);
        for (const r of (rows ?? []) as { id: string; hoh_leads: { name: string; profile_id: string | null } | null }[]) {
          const profile = r.hoh_leads?.profile_id;
          if (profile) {
            const reached = await sendTo([profile], {
              title: `You're the ${s.name} Shift Lead`,
              body: `Your ${s.name} shift starts at ${clock(s.start)}. Open the app to see the last shift's handoff.`,
              url: '/#/handoff', tag: `shift-${date}-${s.name}`,
            });
            sent += reached.size;
          }
          await admin.from('shift_schedule').update({ reminded_at: new Date().toISOString() }).eq('id', r.id);
        }
      }
      return json({ ok: true, sent });
    }

    /* ---- everything else needs a signed-in person ---- */
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await admin.auth.getUser(token);
    if (!auth?.user) return json({ error: 'Please sign in again.' }, 401);
    const { data: me } = await admin.from('profiles').select('role, is_admin, full_name').eq('id', auth.user.id).maybeSingle();
    if (!me || me.role === 'pending') return json({ error: 'Your account is not approved yet.' }, 403);

    if (action === 'test') {
      const reached = await sendTo([auth.user.id], { title: 'HOH Operations Hub', body: 'Notifications are working on this device.', url: '/', tag: 'test' });
      if (reached.size === 0) return json({ error: 'No device is set up for notifications on your account yet.' }, 400);
      return json({ ok: true });
    }

    if (action === 'schedule-posted') {
      if (!(me.is_admin || me.role === 'director')) return json({ error: 'Only directors and admins can send the schedule.' }, 403);
      if (!enabled) return json({ error: 'Notifications are switched off. An admin can turn them on in Setup → Store.' }, 400);
      const from = String(body.from ?? ''), to = String(body.to ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return json({ error: 'Missing dates' }, 400);
      const today = localNow(settings!.timezone || 'America/New_York').date;
      const { data: rows } = await admin
        .from('shift_schedule').select('id, shift_date, shift, lead_id, hoh_leads(name, profile_id)')
        .gte('shift_date', from > today ? from : today).lte('shift_date', to).is('notified_at', null)
        .order('shift_date');
      type Row = { id: string; shift_date: string; shift: string; lead_id: string; hoh_leads: { name: string; profile_id: string | null } | null };
      const byLead = new Map<string, Row[]>();
      for (const r of (rows ?? []) as Row[]) byLead.set(r.lead_id, [...(byLead.get(r.lead_id) ?? []), r]);
      const notified: string[] = [], notReached: string[] = [];
      for (const list of byLead.values()) {
        const lead = list[0].hoh_leads;
        const name = lead?.name ?? 'Unknown';
        const shifts = list.map((r) => `${dayLabel(r.shift_date)} ${r.shift}`);
        let ok = false;
        if (lead?.profile_id) {
          const reached = await sendTo([lead.profile_id], {
            title: list.length === 1 ? "You're on the schedule" : `You're on the schedule for ${list.length} shifts`,
            body: `Shift Lead: ${shifts.slice(0, 8).join(', ')}${shifts.length > 8 ? '…' : ''}`,
            url: '/#/schedule', tag: 'schedule',
          });
          ok = reached.size > 0;
        }
        (ok ? notified : notReached).push(name);
      }
      const ids = ((rows ?? []) as Row[]).map((r) => r.id);
      if (ids.length) await admin.from('shift_schedule').update({ notified_at: new Date().toISOString() }).in('id', ids);
      return json({ ok: true, shifts: ids.length, notified, notReached });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? 'Something went wrong' }, 500);
  }
});
