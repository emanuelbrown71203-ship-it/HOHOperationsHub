/**
 * Demo mode: an in-browser stand-in for the Supabase client, with sample data.
 * Used for the shareable preview build (VITE_DEMO=1). It mirrors the database's
 * rules closely enough to show how the real app behaves: Shift Lead attribution,
 * role permissions, one check per item per day, open/resolved issues.
 */
import { addDays, localDate, weekStart } from './dates';
import { DEFAULT_SETTINGS } from './types';

type Row = Record<string, any>;
type Db = Record<string, Row[]>;
type Result = { data: any; error: { message: string; code?: string } | null };

const DB_KEY = 'hoh.demo.db.v4';
const SESSION_KEY = 'hoh.demo.session.v1';

export const DEMO_ACCOUNTS = [
  { email: 'kitchen@demo', label: 'Store tablet', hint: 'Shared kitchen device: pick a Shift Lead, entries get their name' },
  { email: 'director@demo', label: 'Director', hint: 'Full access, including Setup and approving team accounts' },
  { email: 'lead@demo', label: 'HOH Lead (Jordan)', hint: "Jordan's own account, linked to the Jordan lead. Can't see scores unless a director allows it" },
  { email: 'member@demo', label: 'Team member', hint: 'Personal account: entries get their own name' },
];

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

function minutesAgo(m: number) {
  return new Date(Date.now() - m * 60000).toISOString();
}

/* Sample pictures for the demo (drawn, so nothing is downloaded). */
function svgUrl(svg: string) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function sampleSetupPhoto(title: string, hue: number) {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="hsl(${hue},18%,86%)"/>
  <rect y="360" width="800" height="240" fill="hsl(${hue},10%,70%)"/>
  <rect x="60" y="250" width="680" height="120" rx="10" fill="#cfd6de" stroke="#9aa5b1" stroke-width="4"/>
  ${[0, 1, 2, 3].map((i) => `<rect x="${90 + i * 160}" y="200" width="130" height="70" rx="8" fill="hsl(${hue + i * 40},60%,62%)" stroke="#5a6680" stroke-width="3"/>`).join('')}
  <rect x="90" y="400" width="220" height="140" rx="8" fill="#e9ecef" stroke="#9aa5b1" stroke-width="4"/>
  <rect x="490" y="400" width="220" height="140" rx="8" fill="#e9ecef" stroke="#9aa5b1" stroke-width="4"/>
  <rect x="0" y="0" width="800" height="70" fill="rgba(23,32,51,.75)"/>
  <text x="24" y="46" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#fff">${title}</text>
  <text x="776" y="46" text-anchor="end" font-family="Arial, sans-serif" font-size="22" fill="#fff">Sample photo</text>
</svg>`);
}
function sampleChecklist(position: string, tasks: string[]) {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="850" height="1100" viewBox="0 0 850 1100">
  <rect width="850" height="1100" fill="#fffdf7"/>
  <rect x="50" y="50" width="750" height="110" fill="#e63946"/>
  <text x="80" y="118" font-family="Arial, sans-serif" font-size="44" font-weight="800" fill="#fff">${position.toUpperCase()}</text>
  <text x="770" y="118" text-anchor="end" font-family="Arial, sans-serif" font-size="24" fill="#fff">Position checklist</text>
  ${tasks.map((t, i) => `<rect x="80" y="${215 + i * 78}" width="36" height="36" rx="4" fill="none" stroke="#172033" stroke-width="3"/>
  <text x="140" y="${243 + i * 78}" font-family="Arial, sans-serif" font-size="28" fill="#172033">${t}</text>
  <line x1="80" y1="${275 + i * 78}" x2="770" y2="${275 + i * 78}" stroke="#d6dbe3" stroke-width="2"/>`).join('')}
  <text x="80" y="1040" font-family="Arial, sans-serif" font-size="22" fill="#5a6680">Sample of a scanned paper checklist</text>
</svg>`);
}

/** Files the demo "stores": seeded drawings plus anything uploaded this visit. */
const demoFiles = new Map<string, string>();

function seed(): Db {
  const today = localDate();
  const yesterday = addDays(today, -1);
  const now = new Date().toISOString();
  const pmStarted = new Date().getHours() >= 14;

  const profiles: Row[] = [
    { id: 'u-kitchen', email: 'kitchen@demo', full_name: 'Store Kitchen', role: 'kitchen', created_at: minutesAgo(60 * 24 * 30) },
    { id: 'u-director', email: 'director@demo', full_name: 'Alex Rivera', role: 'director', created_at: minutesAgo(60 * 24 * 40) },
    { id: 'u-member', email: 'member@demo', full_name: 'Sam Lee', role: 'team_member', created_at: minutesAgo(60 * 24 * 10) },
    { id: 'u-lead', email: 'lead@demo', full_name: 'Jordan Ellis', role: 'lead', created_at: minutesAgo(60 * 24 * 60) },
    { id: 'u-new', email: 'new@demo', full_name: 'Riley Brooks', role: 'pending', created_at: minutesAgo(90) },
  ];

  const leads: Row[] = ['Jordan', 'Taylor', 'Morgan', 'Avery'].map((name, i) => ({
    id: `lead-${i + 1}`, name, active: true, sort_order: i + 1, created_at: now, profile_id: i === 0 ? 'u-lead' : null,
  }));

  const templateDefs: [string, string, string[]][] = [
    ['AM Opening', 'AM', [
      'Turn on fryers and verify oil level', 'Check walk-in cooler and freezer temps', 'Calibrate thermometers',
      'Verify thawed product for today', 'Set up and test sanitizer buckets', 'Stock line with packaging and supplies',
    ]],
    ['Shift Swap', 'AM', [
      'Filter fryers', 'Restock breading station', 'Change sanitizer buckets', 'Check hold times and discard expired product',
      'Walk every station with the PM HOH Lead', 'Upload shift swap photos',
    ]],
    ['PM Close', 'PM', [
      'Filter and cover fryers', 'Break down and clean breading table', 'Wrap, label and date all product',
      'Clean and sanitize all prep surfaces', 'Final walk-in temp check', 'Sweep and mop floors', 'Upload close-out photos',
    ]],
    ['Weekly Deep Clean', 'Any', ['Clean hood filters', 'Delime dish machine', 'Clean walk-in shelving', 'Clean behind and under equipment']],
  ];
  const templates: Row[] = [];
  const items: Row[] = [];
  templateDefs.forEach(([name, shift, labels], ti) => {
    const id = `tpl-${ti + 1}`;
    templates.push({ id, name, shift, frequency: shift === 'Any' ? 'weekly' : 'daily', sort_order: ti + 1, active: true, created_at: now });
    labels.forEach((label, li) => items.push({ id: `${id}-item-${li + 1}`, template_id: id, label, sort_order: li + 1, active: true, created_at: now }));
  });

  const checks: Row[] = [];
  const check = (tpl: number, item: number, date: string, by: string, leadId: string | null, mins: number) =>
    checks.push({
      id: uid(), template_id: `tpl-${tpl}`, item_id: `tpl-${tpl}-item-${item}`, check_date: date,
      checked_at: minutesAgo(mins), user_id: leadId ? 'u-kitchen' : 'u-member', lead_id: leadId, performed_by_name: by,
    });
  for (let i = 1; i <= 5; i++) check(1, i, today, 'Jordan', 'lead-1', 400 - i * 6);
  check(2, 1, today, 'Jordan', 'lead-1', 120);
  for (const [tpl, n] of [[1, 6], [2, 6], [3, 7]] as const) for (let i = 1; i <= n; i++) check(tpl, i, yesterday, tpl === 3 ? 'Avery' : 'Morgan', tpl === 3 ? 'lead-4' : 'lead-3', 60 * 20 + i);
  check(4, 1, weekStart(today), 'Avery', 'lead-4', 60 * 30);

  const wasteItems: Row[] = [
    ['Filets', 'each'], ['Spicy Filets', 'each'], ['Nuggets', 'each'], ['Strips', 'each'], ['Grilled Filets', 'each'],
    ['Grilled Nuggets', 'each'], ['Waffle Fries', 'orders'], ['Mac & Cheese', 'pans'], ['Buns', 'each'],
    ['Biscuits', 'each'], ['Hash Browns', 'orders'], ['Raw Chicken', 'lbs'],
  ].map(([name, unit], i) => ({ id: `wi-${i + 1}`, name, default_unit: unit, sort_order: i + 1, active: true, created_at: now }));

  const waste: Row[] = [];
  const w = (date: string, mins: number, shift: string, item: string, qty: number, unit: string, reason: string, by: string, lead: string | null, notes: string | null = null) =>
    waste.push({ id: uid(), logged_at: minutesAgo(mins), log_date: date, shift, item_name: item, quantity: qty, unit, reason, notes, user_id: lead ? 'u-kitchen' : 'u-member', lead_id: lead, performed_by_name: by });
  w(today, 380, 'AM', 'Biscuits', 6, 'each', 'Overproduction', 'Jordan', 'lead-1');
  w(today, 200, 'AM', 'Nuggets', 16, 'each', 'Hold time expired', 'Jordan', 'lead-1');
  w(today, 170, 'AM', 'Filets', 2, 'each', 'Dropped / contaminated', 'Sam Lee', null, 'Dropped during rush');
  w(yesterday, 60 * 22, 'PM', 'Mac & Cheese', 1, 'pans', 'Overproduction', 'Avery', 'lead-4');

  const equipment: Row[] = [
    ['Kitchen (general)', 'Other'], ['Fryer 1', 'Fryer'], ['Fryer 2', 'Fryer'], ['Fryer 3', 'Fryer'], ['Fryer 4', 'Fryer'],
    ['Grill', 'Cooking'], ['Holding Cabinet', 'Holding'], ['Breading Table', 'Prep'], ['Walk-in Cooler', 'Refrigeration'],
    ['Walk-in Freezer', 'Refrigeration'], ['Dish Machine', 'Cleaning'], ['Ice Machine', 'Other'],
  ].map(([name, category], i) => ({ id: `eq-${i}`, name, category, sort_order: i, active: true, created_at: now }));

  const logs: Row[] = [];
  const note = (eq: number, mins: number, shift: string, by: string, lead: string | null, text: string, extra: Row = {}) =>
    logs.push({
      id: uid(), equipment_id: `eq-${eq}`, log_type: 'issue', notes: text, status: 'open', photo_path: null,
      logged_at: minutesAgo(mins), log_date: localDate(new Date(Date.now() - mins * 60000)), shift,
      user_id: lead ? 'u-kitchen' : 'u-member', lead_id: lead, performed_by_name: by,
      resolved_at: null, resolved_by_name: null, resolution_notes: null, ...extra,
    });
  demoFiles.set('demo/fryer3.svg', sampleSetupPhoto('Fryer 3 temperature display', 10));
  note(3, 110, 'AM', 'Sam Lee', null, "Fryer 3 is slow to come back up to temp after a drop. Tech is scheduled for Tuesday.", { photo_path: 'demo/fryer3.svg' });
  note(0, 60 * 18, 'PM', 'Avery', 'lead-4', 'Hand sink by the breading table drains slowly.');
  note(11, 60 * 26, 'PM', 'Morgan', 'lead-3', 'Ice is coming out cloudy. Filter may need changing.');
  note(9, 60 * 30, 'AM', 'Morgan', 'lead-3', 'Door gasket torn on the left side.', {
    status: 'resolved', resolved_at: minutesAgo(60 * 4), resolved_by_name: 'Alex Rivera', resolution_notes: 'Replaced gasket',
  });

  // Shift handoffs and lead ratings: eight weeks of AM/PM shifts. Each lead has a steady pattern
  // (Avery strong, Jordan solid, Taylor improving, Morgan slipping) so the Lead Scores page has a story.
  const handoffs: Row[] = [];
  const photos: Row[] = [];
  const ratings: Row[] = [];
  let seedN = 20261114;
  const rand = () => {
    seedN = (seedN * 1664525 + 1013904223) % 4294967296;
    return seedN / 4294967296;
  };
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  ['Breading table', 'Fry station', 'Walk-in cooler'].forEach((title, i) => demoFiles.set(`demo/generic-${i}.svg`, sampleSetupPhoto(title, 190 + i * 40)));
  const leadIds = { Jordan: 'lead-1', Taylor: 'lead-2', Morgan: 'lead-3', Avery: 'lead-4' } as const;
  type LeadName = keyof typeof leadIds;
  const DAYS = 56;
  const meanFor = (name: LeadName, t: number) => ({ Avery: 4.6, Jordan: 4.2, Taylor: 3.2 + 0.9 * t, Morgan: 4.3 - 1.0 * t })[name];
  const submitP: Record<LeadName, number> = { Avery: 0.97, Jordan: 0.94, Taylor: 0.9, Morgan: 0.85 };
  const COMMENTS: Record<number, string[]> = {
    5: ['Best setup all week. Thank you!', 'Everything stocked, labeled and wiped down.', 'Spotless line. Walked right into service.'],
    4: ['Clean line, just restock the sauces next time.', 'Good setup. Breading was a little low.', 'Solid. Fryer 2 still needed filtering.'],
    3: ["Fryers weren't filtered.", 'Prep was behind when we came in.', 'Okay, but the walk-in was messy.'],
    2: ['Line not stocked and trash was full.', 'No labels on product in the walk-in.', 'Breading table was not broken down.'],
    1: ['Nothing was set up for us.', 'Had to close down the line to restock.'],
  };
  const leadFor = (daysAgo: number, shift: 'AM' | 'PM'): LeadName =>
    shift === 'AM' ? (daysAgo % 2 === 0 ? 'Jordan' : 'Taylor') : daysAgo % 9 === 4 ? 'Taylor' : daysAgo % 2 === 0 ? 'Avery' : 'Morgan';
  const at = (date: string, h: number, m: number) => {
    const [y, mo, d] = date.split('-').map(Number);
    return new Date(y, mo - 1, d, h, m).toISOString();
  };
  const SPECIAL: Record<string, { notes: string; pics: string[] }> = {
    [`${yesterday}|AM`]: { notes: 'Breading station fully stocked. We ran low on spicy breading, more is thawing.', pics: ['Breading table', 'Fry station'] },
    [`${yesterday}|PM`]: { notes: 'Closed clean. Fryer 3 still slow, left a kitchen note.', pics: ['Breading table after close', 'Fryers covered', 'Walk-in'] },
    [`${today}|AM`]: { notes: 'Busy lunch. Prep is caught up, filets thawing for dinner.', pics: ['Shift swap: breading', 'Shift swap: fries'] },
  };
  // The shift right before the current one is left unrated so the rating card shows.
  const unratedKey = pmStarted ? `${today}|AM` : `${yesterday}|PM`;
  const slots: { date: string; shift: 'AM' | 'PM'; daysAgo: number }[] = [];
  for (let daysAgo = DAYS; daysAgo >= 1; daysAgo--) for (const sh of ['AM', 'PM'] as const) slots.push({ date: addDays(today, -daysAgo), shift: sh, daysAgo });
  if (pmStarted) slots.push({ date: today, shift: 'AM', daysAgo: 0 });
  slots.forEach((slot, idx) => {
    const name = leadFor(slot.daysAgo, slot.shift);
    const key = `${slot.date}|${slot.shift}`;
    const special = SPECIAL[key];
    const submitted = !!special || rand() < submitP[name];
    const [eh, em] = slot.shift === 'AM' ? [13, 50] : [22, 40];
    const id = uid();
    const h: Row = {
      id, shift_date: slot.date, shift: slot.shift, lead_id: leadIds[name], lead_name: name,
      notes: special?.notes ?? null, notes_by_name: special ? name : null, notes_at: special ? at(slot.date, eh, em) : null,
      submitted_at: submitted ? at(slot.date, eh, em) : null, submitted_by_name: submitted ? name : null,
      rated_by_name: null, rated_at: null, created_at: at(slot.date, eh - 8, 0),
    };
    handoffs.push(h);
    if (submitted) {
      const pics = special?.pics ?? Array.from({ length: 1 + Math.floor(rand() * 3) }, (_, i) => `generic-${i}`);
      pics.forEach((p, i) => {
        let path = `demo/${p}.svg`;
        if (special) {
          path = `demo/${slot.date}-${slot.shift}-${i}.svg`;
          demoFiles.set(path, sampleSetupPhoto(p, 200 + i * 35));
        }
        photos.push({ id: uid(), handoff_id: id, path, user_id: 'u-kitchen', uploaded_by_name: name, created_at: at(slot.date, eh, em - 5) });
      });
    }
    // The incoming shift's lead rates it (never their own shift).
    const next = slots[idx + 1];
    if (!next || key === unratedKey) return;
    const incoming = leadFor(next.daysAgo, next.shift);
    if (incoming === name || rand() > 0.9) return;
    const t = 1 - slot.daysAgo / DAYS;
    const rating = Math.max(1, Math.min(5, Math.round(meanFor(name, t) + (rand() - 0.5) * 1.8)));
    const ratedAt = slot.shift === 'AM' ? at(slot.date, 14, 20) : at(addDays(slot.date, 1), 5, 35);
    ratings.push({
      handoff_id: id, rating, comment: rand() < 0.45 ? pick(COMMENTS[rating]) : null,
      rated_by_user: 'u-kitchen', rated_by_lead: leadIds[incoming], rated_by_name: incoming, rated_at: ratedAt,
    });
    Object.assign(h, { rated_by_name: incoming, rated_at: ratedAt });
  });

  const positions: Row[] = ['Breading', 'Fries', 'Machines', 'Prep', 'Grill', 'Dish'].map((name, i) => ({
    id: `pos-${i + 1}`, name, description: null, sort_order: i + 1, active: true, created_at: now,
  }));
  positions[0].description = 'Laminated copy hangs above the breading table.';
  const positionFiles: Row[] = [];
  const attach = (pos: number, name: string, tasks: string[]) => {
    const path = `demo/position-${pos}.svg`;
    demoFiles.set(path, sampleChecklist(name, tasks));
    positionFiles.push({ id: uid(), position_id: `pos-${pos}`, path, file_name: `${name} checklist`, content_type: 'image/svg+xml', created_at: now });
  };
  attach(1, 'Breading', ['Sanitize table and bins', 'Sift breading every 30 min', 'Check filet temps', 'Rotate product FIFO', 'Change gloves between tasks', 'Wipe down at swap']);
  attach(2, 'Fries', ['Check oil level and color', 'Salt station stocked', 'Hold time timers on', 'Restock boxes and bags', 'Wipe the fry dump', 'Filter at swap']);

  return {
    profiles, hoh_leads: leads, checklist_templates: templates, checklist_items: items, checklist_checks: checks,
    waste_items: wasteItems, waste_entries: waste, equipment, equipment_logs: logs,
    app_settings: [{ id: 1, ...DEFAULT_SETTINGS, store_name: 'Demo Store #0000', updated_at: now }],
    weekly_focus: [{ week_start: weekStart(today), focus: 'Hold times! Every pan gets a timer, every time. Let’s hit zero expired product this week.', created_by_name: 'Alex Rivera', updated_at: minutesAgo(60 * 30) }],
    shoutouts: [
      { id: uid(), lead_id: 'lead-4', lead_name: 'Avery', message: 'Ran a spotless PM close last night. Every station was stocked and ready for AM.', created_by_name: 'Alex Rivera', created_at: minutesAgo(60 * 9) },
      { id: uid(), lead_id: 'lead-1', lead_name: 'Jordan', message: 'Kept the line calm during Saturday’s catering rush.', created_by_name: 'Alex Rivera', created_at: minutesAgo(60 * 24 * 4) },
    ],
    shift_handoffs: handoffs, handoff_photos: photos, shift_ratings: ratings, positions, position_files: positionFiles,
  };
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */
function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function save(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: demo still works for this visit */
  }
}

let db: Db = {};
const persist = () => save(DB_KEY, db);

/** Runs only in demo builds, so the real app never touches demo storage. */
function init() {
  seed(); // registers the sample pictures
  // Re-seed each new day so "today" always has sample activity.
  const stored = load<Db>(DB_KEY);
  if (stored && load<string>(DB_KEY + '.day') === localDate()) {
    db = stored;
  } else {
    db = seed();
    save(DB_KEY + '.day', localDate());
  }
  persist();
  session = load<Session>(SESSION_KEY);
}

export function resetDemo() {
  db = seed();
  persist();
  save(DB_KEY + '.day', localDate());
  window.location.reload();
}

/* ------------------------------------------------------------------ */
/* Realtime                                                            */
/* ------------------------------------------------------------------ */
type Listener = { table: string; cb: () => void };
const channels = new Set<{ listeners: Listener[] }>();
function emit(table: string) {
  setTimeout(() => {
    for (const ch of channels) for (const l of ch.listeners) if (l.table === table) l.cb();
  }, 0);
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */
type Session = { user: { id: string; email: string } };
let session: Session | null = null;
const authListeners = new Set<(event: string, s: Session | null) => void>();
function setSession(s: Session | null, event: string) {
  session = s;
  save(SESSION_KEY, s);
  for (const cb of authListeners) cb(event, s);
}
const me = () => db.profiles.find((p) => p.id === session?.user.id) ?? null;
const isManager = () => ['lead', 'director'].includes(me()?.role);
const isActive = () => !!me() && me()!.role !== 'pending';

/** Mirrors public.can_view_scores(): directors always; HOH Leads or everyone if a director allows it. */
const canViewScores = () => {
  const role = me()?.role;
  const vis = db.app_settings?.[0]?.scores_visibility ?? 'directors';
  return role === 'director' || (vis === 'managers' && role === 'lead') || (vis === 'everyone' && isActive());
};
/** Mirrors public.actor_lead_id(): the chosen Shift Lead on the shared device, or the lead linked to this account. */
const actorLeadId = (leadId: string | null): string | null => {
  if (me()?.role === 'kitchen') return db.hoh_leads.find((l) => l.id === leadId && l.active)?.id ?? null;
  return db.hoh_leads.find((l) => l.profile_id && l.profile_id === session?.user.id && l.active)?.id ?? null;
};

/** Read-only views, computed like the real database views. */
const VIEWS: Record<string, () => Row[]> = {
  lead_rating_history: () =>
    db.shift_ratings.flatMap((r) => {
      const h = db.shift_handoffs.find((x) => x.id === r.handoff_id);
      if (!h) return [];
      return [{
        handoff_id: h.id, shift_date: h.shift_date, shift: h.shift, lead_id: h.lead_id, lead_name: h.lead_name,
        rating: r.rating, comment: r.comment, rated_by_name: r.rated_by_name, rated_at: r.rated_at,
        handoff_submitted: !!h.submitted_at, photo_count: db.handoff_photos.filter((p) => p.handoff_id === h.id).length,
      }];
    }),
};
const SCORE_TABLES = ['shift_ratings', 'lead_rating_history'];
const keyOf = (r: Row) => r.id ?? r.handoff_id ?? r.week_start;

const rls = (table: string): Result => ({ data: null, error: { message: `new row violates row-level security policy for table "${table}"` } });
const fail = (message: string, code?: string): Result => ({ data: null, error: { message, code } });

function actorName(leadId: string | null): string | Result {
  const p = me();
  if (!p || p.role === 'pending') return fail('Your account is not approved yet');
  if (p.role === 'kitchen') {
    if (!leadId) return fail('Select the Shift Lead before logging');
    const lead = db.hoh_leads.find((l) => l.id === leadId && l.active);
    if (!lead) return fail('That Shift Lead is not on the active HOH Leads list');
    return lead.name;
  }
  return p.full_name || 'Unknown';
}

const CONFIG_TABLES = ['hoh_leads', 'checklist_templates', 'checklist_items', 'waste_items', 'equipment', 'weekly_focus', 'shoutouts', 'positions', 'position_files'];
const CREATED_BY_TABLES = ['weekly_focus', 'shoutouts'];
const LOG_TABLES = ['checklist_checks', 'waste_entries', 'equipment_logs'];
const DEFAULTS: Record<string, Row> = {
  hoh_leads: { active: true, sort_order: 0 },
  checklist_templates: { shift: 'Any', frequency: 'daily', active: true, sort_order: 0 },
  checklist_items: { active: true, sort_order: 0 },
  waste_items: { default_unit: 'each', active: true, sort_order: 0 },
  equipment: { category: 'Other', active: true, sort_order: 0 },
  positions: { description: null, active: true, sort_order: 0 },
};

/* ------------------------------------------------------------------ */
/* Query builder                                                       */
/* ------------------------------------------------------------------ */
class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private filters: ((r: Row) => boolean)[] = [];
  private orders: [string, boolean][] = [];
  private max: number | null = null;
  private payload: any = null;
  private one: 'single' | 'maybe' | null = null;
  private returning = false;

  constructor(private table: string) {}

  select() { if (this.op !== 'select') this.returning = true; return this; }
  insert(p: Row | Row[]) { this.op = 'insert'; this.payload = p; return this; }
  update(p: Row) { this.op = 'update'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  gte(c: string, v: any) { this.filters.push((r) => r[c] >= v); return this; }
  lte(c: string, v: any) { this.filters.push((r) => r[c] <= v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  not(c: string, op: string, v: unknown) { this.filters.push((r) => (op === 'is' && v === null ? r[c] !== null && r[c] !== undefined : r[c] !== v)); return this; }
  order(c: string, opts: { ascending?: boolean } = {}) { this.orders.push([c, opts.ascending !== false]); return this; }
  limit(n: number) { this.max = n; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null) {
    return new Promise<Result>((res) => setTimeout(() => res(this.run()), 60)).then(ok, bad);
  }

  private shape(rows: Row[]): Result {
    const copy = rows.map((r) => ({ ...r }));
    if (this.one) {
      if (copy.length === 1) return { data: copy[0], error: null };
      if (copy.length === 0 && this.one === 'maybe') return { data: null, error: null };
      return fail('JSON object requested, multiple (or no) rows returned', 'PGRST116');
    }
    return { data: copy, error: null };
  }

  private visible(): Row[] {
    if (!session) return [];
    let rows = VIEWS[this.table] ? VIEWS[this.table]() : db[this.table] ?? [];
    if (!isActive()) rows = this.table === 'profiles' ? rows.filter((r) => r.id === session!.user.id) : [];
    if (SCORE_TABLES.includes(this.table) && !canViewScores()) rows = [];
    return rows.filter((r) => this.filters.every((f) => f(r)));
  }

  private run(): Result {
    const t = this.table;
    if (!session) return fail(`permission denied for table ${t}`);
    try {
      if (this.op === 'select') {
        let rows = this.visible();
        for (const [c, asc] of [...this.orders].reverse()) {
          rows = [...rows].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1));
        }
        if (this.max !== null) rows = rows.slice(0, this.max);
        return this.shape(rows);
      }

      if (this.op === 'insert') {
        if (CONFIG_TABLES.includes(t) && !isManager()) return rls(t);
        if (!isActive()) return rls(t);
        const input = Array.isArray(this.payload) ? this.payload : [this.payload];
        const created: Row[] = [];
        for (const raw of input) {
          const row: Row = { ...(DEFAULTS[t] ?? {}), ...raw, id: uid(), created_at: new Date().toISOString() };
          if (LOG_TABLES.includes(t)) {
            const name = actorName(row.lead_id ?? null);
            if (typeof name !== 'string') return name;
            row.user_id = session.user.id;
            row.performed_by_name = name;
            if (me()?.role !== 'kitchen') row.lead_id = null;
          }
          if (t === 'checklist_checks') {
            row.checked_at = new Date().toISOString();
            if (db.checklist_checks.some((c) => c.item_id === row.item_id && c.check_date === row.check_date)) {
              return fail('duplicate key value violates unique constraint "checklist_checks_item_id_check_date_key"', '23505');
            }
          }
          if (t === 'waste_entries') row.logged_at = new Date().toISOString();
          if (CREATED_BY_TABLES.includes(t)) row.created_by_name = me()?.full_name || 'Unknown';
          if (t === 'equipment_logs') {
            Object.assign(row, {
              logged_at: new Date().toISOString(), status: row.log_type === 'issue' ? 'open' : 'done',
              resolved_at: null, resolved_by_name: null, resolution_notes: null,
            });
          }
          created.push(row);
        }
        db[t] = [...(db[t] ?? []), ...created];
        persist();
        emit(t);
        return this.returning ? this.shape(created) : { data: null, error: null };
      }

      const targets = this.visible();

      if (this.op === 'update') {
        if ((CONFIG_TABLES.includes(t) || t === 'app_settings') && !isManager()) return this.returning ? this.shape([]) : { data: null, error: null };
        if (t === 'app_settings' && 'scores_visibility' in this.payload && me()?.role !== 'director' && targets.some((r) => r.scores_visibility !== this.payload.scores_visibility)) {
          return fail('Only directors can change who sees lead scores');
        }
        if (t === 'hoh_leads' && 'profile_id' in this.payload && me()?.role !== 'director') return fail('Only directors can link accounts to HOH Leads');
        if (VIEWS[t] || t === 'shift_ratings' || t === 'shift_handoffs') return this.returning ? this.shape([]) : { data: null, error: null };
        if (t === 'profiles') {
          for (const r of targets) {
            if (r.id !== session.user.id && me()?.role !== 'director') continue;
            if ('role' in this.payload && this.payload.role !== r.role) {
              if (me()?.role !== 'director') return fail('Only directors can change roles');
              if (r.role === 'director' && db.profiles.filter((p) => p.role === 'director').length <= 1) {
                return fail('There must be at least one director');
              }
            }
          }
        }
        const patch = { ...this.payload };
        if (LOG_TABLES.includes(t)) { delete patch.user_id; delete patch.lead_id; delete patch.performed_by_name; }
        if (CREATED_BY_TABLES.includes(t)) patch.created_by_name = me()?.full_name || 'Unknown';
        const changed = targets.filter((r) => !LOG_TABLES.includes(t) || r.user_id === session!.user.id || isManager());
        changed.forEach((r) => Object.assign(r, patch));
        persist();
        emit(t);
        return this.returning ? this.shape(changed) : { data: null, error: null };
      }

      // delete
      let removable = targets;
      if (CONFIG_TABLES.includes(t)) removable = isManager() ? targets : [];
      else if (LOG_TABLES.includes(t) || t === 'handoff_photos') removable = targets.filter((r) => r.user_id === session!.user.id || isManager());
      else if (t === 'shift_handoffs' || t === 'app_settings' || VIEWS[t]) removable = [];
      else if (t === 'shift_ratings') removable = me()?.role === 'director' ? targets : [];
      else if (t === 'profiles') removable = [];
      const ids = new Set(removable.map(keyOf));
      db[t] = (db[t] ?? []).filter((r) => !ids.has(keyOf(r)));
      if (t === 'shift_ratings') {
        db.shift_handoffs.forEach((h) => ids.has(h.id) && Object.assign(h, { rated_by_name: null, rated_at: null }));
        emit('shift_handoffs');
      }
      // Cascades, like the real foreign keys.
      if (t === 'checklist_templates') {
        db.checklist_items = db.checklist_items.filter((r) => !ids.has(r.template_id));
        db.checklist_checks = db.checklist_checks.filter((r) => !ids.has(r.template_id));
      }
      if (t === 'checklist_items') db.checklist_checks = db.checklist_checks.filter((r) => !ids.has(r.item_id));
      if (t === 'equipment') db.equipment_logs = db.equipment_logs.filter((r) => !ids.has(r.equipment_id));
      if (t === 'positions') db.position_files = db.position_files.filter((r) => !ids.has(r.position_id));
      if (t === 'hoh_leads') for (const lt of [...LOG_TABLES, 'shift_handoffs']) db[lt].forEach((r) => ids.has(r.lead_id) && (r.lead_id = null));
      persist();
      emit(t);
      if (t === 'checklist_templates' || t === 'checklist_items') emit('checklist_checks');
      return this.returning ? this.shape(removable) : { data: null, error: null };
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Demo error');
    }
  }
}

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */
export function createDemoClient() {
  init();
  return {
    from: (table: string) => new Query(table),

    rpc: async (fn: string, args: Row): Promise<Result> => {
      await new Promise((r) => setTimeout(r, 60));
      const role = me()?.role;
      const ensureHandoff = (date: string, shift: string) => {
        let h = db.shift_handoffs.find((x) => x.shift_date === date && x.shift === shift);
        if (!h) {
          h = { id: uid(), shift_date: date, shift, lead_id: null, lead_name: null, notes: null, notes_by_name: null, notes_at: null, submitted_at: null, submitted_by_name: null, rated_by_name: null, rated_at: null, created_at: new Date().toISOString() };
          db.shift_handoffs.push(h);
        }
        return h;
      };
      const done = (data: unknown = null): Result => {
        persist();
        emit('shift_handoffs');
        emit('shift_ratings');
        return { data, error: null };
      };
      const isRated = (h: Row) => db.shift_ratings.some((r) => r.handoff_id === h.id);

      if (fn === 'set_shift_lead') {
        if (!role || !['kitchen', 'lead', 'director'].includes(role)) return fail('Only the shared kitchen device or a lead can set the Shift Lead');
        const lead = db.hoh_leads.find((l) => l.id === args.p_lead_id && l.active);
        if (!lead) return fail('That Shift Lead is not on the active HOH Leads list');
        const h = ensureHandoff(args.p_date, args.p_shift);
        if (role !== 'director' && isRated(h)) return fail('That shift has already been rated. Ask a director to change its Shift Lead.');
        Object.assign(h, { lead_id: lead.id, lead_name: lead.name });
        return done();
      }

      const name = actorName(args.p_lead_id ?? null);
      if (typeof name !== 'string') return name;
      const nowIso = new Date().toISOString();

      if (fn === 'save_handoff' || fn === 'add_handoff_photo') {
        const h = ensureHandoff(args.p_date, args.p_shift);
        if (fn === 'save_handoff') {
          const notes = (args.p_notes ?? '').trim() || null;
          Object.assign(h, { notes, notes_by_name: notes ? name : null, notes_at: notes ? nowIso : null });
          if (args.p_submit) {
            Object.assign(h, { submitted_at: nowIso, submitted_by_name: name });
            const lead = actorLeadId(args.p_lead_id ?? null);
            if (lead && (role === 'kitchen' || !h.lead_id) && !isRated(h)) {
              Object.assign(h, { lead_id: lead, lead_name: db.hoh_leads.find((l) => l.id === lead)?.name ?? null });
            }
          }
        } else {
          db.handoff_photos.push({ id: uid(), handoff_id: h.id, path: args.p_path, user_id: session?.user.id, uploaded_by_name: name, created_at: nowIso });
          emit('handoff_photos');
        }
        return done(h.id);
      }

      if (fn === 'rate_shift' || fn === 'rate_handoff') {
        if (!(args.p_rating >= 1 && args.p_rating <= 5)) return fail('Choose 1 to 5 stars');
        const raterLead = actorLeadId(args.p_lead_id ?? null);
        const h = ensureHandoff(args.p_date, args.p_shift);
        if (!h.lead_id) {
          if (!args.p_rated_lead_id) return fail(`Choose who was the Shift Lead for the ${args.p_shift} shift`);
          const lead = db.hoh_leads.find((l) => l.id === args.p_rated_lead_id && l.active);
          if (!lead) return fail('That Shift Lead is not on the active HOH Leads list');
          Object.assign(h, { lead_id: lead.id, lead_name: lead.name });
        }
        if (raterLead && raterLead === h.lead_id) return fail("You can't rate your own shift");
        const prev = db.shift_ratings.find((r) => r.handoff_id === h.id);
        if (prev && !isManager() && !(prev.rated_by_user === session?.user.id && (prev.rated_by_lead ?? null) === raterLead)) {
          return fail(`This shift was already rated by ${prev.rated_by_name}`);
        }
        const row = { handoff_id: h.id, rating: args.p_rating, comment: (args.p_comment ?? '').trim() || null, rated_by_user: session?.user.id, rated_by_lead: raterLead, rated_by_name: name, rated_at: nowIso };
        db.shift_ratings = [...db.shift_ratings.filter((r) => r.handoff_id !== h.id), row];
        Object.assign(h, { rated_by_name: name, rated_at: nowIso });
        return done(h.id);
      }

      if (fn !== 'resolve_equipment_issue') return fail(`Unknown function ${fn}`);
      const log = db.equipment_logs.find((l) => l.id === args.p_log_id && l.status === 'open');
      if (!log) return fail('Issue not found or already resolved');
      Object.assign(log, {
        status: 'resolved', resolved_at: new Date().toISOString(), resolved_by_name: name,
        resolution_notes: (args.p_notes ?? '').trim() || null,
      });
      persist();
      emit('equipment_logs');
      return { data: null, error: null };
    },

    functions: {
      invoke: async (name: string, opts?: { body?: Row }) => {
        await new Promise((r) => setTimeout(r, 200));
        const body = opts?.body ?? {};
        const isDirector = me()?.role === 'director';
        if (name === 'set-password') {
          if (!isDirector) return { data: null, error: { message: 'Only directors can set passwords for other people.' } };
          return { data: { ok: true }, error: null }; // the demo has no real passwords
        }
        if (name === 'account') {
          if (body.action === 'team') {
            if (!isDirector) return { data: null, error: { message: 'Only directors can see this.' } };
            return { data: { people: db.profiles.map((p) => ({ userId: p.id, email: null, passkeys: p.role === 'pending' ? 0 : p.role === 'director' ? 2 : 1 })) }, error: null };
          }
          if (body.action === 'code-create') {
            if (!isDirector) return { data: null, error: { message: 'Only directors can make sign-in codes.' } };
            const A = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
            const c = Array.from({ length: 8 }, () => A[Math.floor(Math.random() * A.length)]).join('');
            return { data: { code: `${c.slice(0, 4)}-${c.slice(4)}`, expires_at: new Date(Date.now() + 864e5).toISOString() }, error: null };
          }
          if (body.action === 'remove-passkeys') return { data: { removed: 1 }, error: null };
          return { data: null, error: { message: 'Passkeys can’t be used in this demo.' } };
        }
        return { data: null, error: { message: `Unknown function ${name}` } };
      },
    },

    storage: {
      from: () => ({
        upload: async (path: string, file: Blob) => {
          demoFiles.set(path, URL.createObjectURL(file)); // kept for this visit only
          return { data: { path }, error: null };
        },
        createSignedUrl: async (path: string) => ({
          data: { signedUrl: demoFiles.get(path) ?? svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#e1e7f0"/><text x="200" y="155" text-anchor="middle" font-family="Arial" font-size="20" fill="#5a6680">Photo (demo: reload clears uploads)</text></svg>`) },
          error: null,
        }),
        remove: async (paths: string[]) => {
          paths.forEach((p) => demoFiles.delete(p));
          return { data: null, error: null };
        },
      }),
    },

    channel: () => {
      const ch = {
        listeners: [] as Listener[],
        on(_event: string, filter: { table: string }, cb: () => void) {
          ch.listeners.push({ table: filter.table, cb });
          return ch;
        },
        subscribe() {
          channels.add(ch);
          return ch;
        },
      };
      return ch;
    },
    removeChannel: (ch: any) => {
      channels.delete(ch);
      return Promise.resolve('ok');
    },

    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: (cb: (event: string, s: Session | null) => void) => {
        authListeners.add(cb);
        return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } };
      },
      signInWithPassword: async ({ email }: { email: string }) => {
        const p = db.profiles.find((x) => x.email === email.trim().toLowerCase());
        if (!p) return { data: { user: null, session: null }, error: { message: 'In the demo, use one of the demo account buttons.' } };
        const s = { user: { id: p.id, email: p.email } };
        setSession(s, 'SIGNED_IN');
        return { data: { user: s.user, session: s }, error: null };
      },
      signUp: async () => ({
        data: { user: null, session: null },
        error: { message: 'Creating accounts is turned off in the demo. Use one of the demo account buttons.' },
      }),
      resetPasswordForEmail: async () => ({ data: {}, error: { message: 'Password emails are turned off in the demo.' } }),
      updateUser: async () => ({ data: {}, error: { message: 'Passwords can’t be changed in the demo.' } }),
      signOut: async () => {
        setSession(null, 'SIGNED_OUT');
        return { error: null };
      },
    },
  };
}
