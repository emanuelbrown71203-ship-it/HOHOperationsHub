/**
 * Demo mode: an in-browser stand-in for the Supabase client, with sample data.
 * Used for the shareable preview build (VITE_DEMO=1). It mirrors the database's
 * rules closely enough to show how the real app behaves: Shift Lead attribution,
 * role permissions, one check per item per day, open/resolved issues.
 */
import { addDays, localDate } from './dates';

type Row = Record<string, any>;
type Db = Record<string, Row[]>;
type Result = { data: any; error: { message: string; code?: string } | null };

const DB_KEY = 'hoh.demo.db.v1';
const SESSION_KEY = 'hoh.demo.session.v1';

export const DEMO_ACCOUNTS = [
  { email: 'kitchen@demo', label: 'Store tablet', hint: 'Shared kitchen device: pick a Shift Lead, entries get their name' },
  { email: 'director@demo', label: 'Director', hint: 'Full access, including Setup and approving team accounts' },
  { email: 'member@demo', label: 'Team member', hint: 'Personal account: entries get their own name' },
];

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

function minutesAgo(m: number) {
  return new Date(Date.now() - m * 60000).toISOString();
}

function seed(): Db {
  const today = localDate();
  const yesterday = addDays(today, -1);
  const now = new Date().toISOString();

  const profiles: Row[] = [
    { id: 'u-kitchen', email: 'kitchen@demo', full_name: 'Store Kitchen', role: 'kitchen', created_at: minutesAgo(60 * 24 * 30) },
    { id: 'u-director', email: 'director@demo', full_name: 'Alex Rivera', role: 'director', created_at: minutesAgo(60 * 24 * 40) },
    { id: 'u-member', email: 'member@demo', full_name: 'Sam Lee', role: 'team_member', created_at: minutesAgo(60 * 24 * 10) },
    { id: 'u-new', email: 'new@demo', full_name: 'Riley Brooks', role: 'pending', created_at: minutesAgo(90) },
  ];

  const leads: Row[] = ['Jordan', 'Taylor', 'Morgan', 'Avery'].map((name, i) => ({
    id: `lead-${i + 1}`, name, active: true, sort_order: i + 1, created_at: now,
  }));

  const templateDefs: [string, string, string[]][] = [
    ['Opening', 'Opening', [
      'Turn on fryers and verify oil level', 'Check walk-in cooler and freezer temps', 'Calibrate thermometers',
      'Set up breading table', 'Verify thawed product for today', 'Set up and test sanitizer buckets',
      'Stock hand sinks (soap and towels)', 'Stock line with packaging and supplies',
    ]],
    ['Mid-Shift', 'Mid', [
      'Filter fryers', 'Restock breading station', 'Change sanitizer buckets',
      'Check hold times and discard expired product', 'Sweep and spot-mop kitchen floor', 'Empty trash',
    ]],
    ['Closing', 'Closing', [
      'Filter and cover fryers', 'Break down and clean breading table', 'Clean grill', 'Wrap, label and date all product',
      'Run dishes and clean dish area', 'Clean and sanitize all prep surfaces', 'Final walk-in temp check',
      'Sweep and mop floors', 'Take out trash and recycling',
    ]],
    ['Weekly Deep Clean', 'Any', [
      'Clean hood filters', 'Delime dish machine', 'Clean walk-in shelving', 'Clean behind and under equipment',
    ]],
  ];
  const templates: Row[] = [];
  const items: Row[] = [];
  templateDefs.forEach(([name, shift, labels], ti) => {
    const id = `tpl-${ti + 1}`;
    templates.push({ id, name, shift, sort_order: ti + 1, active: true, created_at: now });
    labels.forEach((label, li) =>
      items.push({ id: `${id}-item-${li + 1}`, template_id: id, label, sort_order: li + 1, active: true, created_at: now }),
    );
  });

  const checks: Row[] = [];
  const check = (tpl: number, item: number, date: string, by: string, leadId: string | null, mins: number) =>
    checks.push({
      id: uid(), template_id: `tpl-${tpl}`, item_id: `tpl-${tpl}-item-${item}`, check_date: date,
      checked_at: minutesAgo(mins), user_id: leadId ? 'u-kitchen' : 'u-member', lead_id: leadId, performed_by_name: by,
    });
  // Today: Opening done except one, Mid-Shift started.
  for (let i = 1; i <= 7; i++) check(1, i, today, 'Jordan', 'lead-1', 420 - i * 6);
  check(2, 1, today, 'Taylor', 'lead-2', 150);
  check(2, 2, today, 'Sam Lee', null, 120);
  // Yesterday: everything done.
  for (const [tpl, n] of [[1, 8], [2, 6], [3, 9]] as const) for (let i = 1; i <= n; i++) check(tpl, i, yesterday, 'Morgan', 'lead-3', 60 * 20 + i);

  const wasteItems: Row[] = [
    ['Filets', 'each'], ['Spicy Filets', 'each'], ['Nuggets', 'each'], ['Strips', 'each'], ['Grilled Filets', 'each'],
    ['Grilled Nuggets', 'each'], ['Waffle Fries', 'orders'], ['Mac & Cheese', 'pans'], ['Buns', 'each'],
    ['Biscuits', 'each'], ['Hash Browns', 'orders'], ['Raw Chicken', 'lbs'],
  ].map(([name, unit], i) => ({ id: `wi-${i + 1}`, name, default_unit: unit, sort_order: i + 1, active: true, created_at: now }));

  const waste: Row[] = [];
  const w = (date: string, mins: number, shift: string, item: string, qty: number, unit: string, reason: string, by: string, lead: string | null, notes: string | null = null) =>
    waste.push({ id: uid(), logged_at: minutesAgo(mins), log_date: date, shift, item_name: item, quantity: qty, unit, reason, notes, user_id: lead ? 'u-kitchen' : 'u-member', lead_id: lead, performed_by_name: by });
  w(today, 380, 'Opening', 'Biscuits', 6, 'each', 'Overproduction', 'Jordan', 'lead-1');
  w(today, 330, 'Opening', 'Hash Browns', 3, 'orders', 'Hold time expired', 'Jordan', 'lead-1');
  w(today, 200, 'Mid', 'Nuggets', 16, 'each', 'Hold time expired', 'Taylor', 'lead-2');
  w(today, 170, 'Mid', 'Filets', 2, 'each', 'Dropped / contaminated', 'Sam Lee', null, 'Dropped during rush');
  w(today, 95, 'Mid', 'Waffle Fries', 5, 'orders', 'Hold time expired', 'Taylor', 'lead-2');
  w(yesterday, 60 * 26, 'Mid', 'Spicy Filets', 4, 'each', 'Overcooked / burnt', 'Morgan', 'lead-3');
  w(yesterday, 60 * 22, 'Closing', 'Mac & Cheese', 1, 'pans', 'Overproduction', 'Avery', 'lead-4');
  w(addDays(today, -3), 60 * 75, 'Closing', 'Nuggets', 24, 'each', 'Overproduction', 'Avery', 'lead-4');

  const equipment: Row[] = [
    ['Fryer 1', 'Fryer'], ['Fryer 2', 'Fryer'], ['Fryer 3', 'Fryer'], ['Fryer 4', 'Fryer'], ['Grill', 'Cooking'],
    ['Holding Cabinet', 'Holding'], ['Breading Table', 'Prep'], ['Walk-in Cooler', 'Refrigeration'],
    ['Walk-in Freezer', 'Refrigeration'], ['Dish Machine', 'Cleaning'], ['Ice Machine', 'Other'],
  ].map(([name, category], i) => ({ id: `eq-${i + 1}`, name, category, sort_order: i + 1, active: true, created_at: now }));

  const logs: Row[] = [];
  const l = (eq: number, type: string, mins: number, shift: string, by: string, lead: string | null, notes: string | null = null, extra: Row = {}) =>
    logs.push({
      id: uid(), equipment_id: `eq-${eq}`, log_type: type, notes, status: type === 'issue' ? 'open' : 'done',
      logged_at: minutesAgo(mins), log_date: localDate(new Date(Date.now() - mins * 60000)), shift,
      user_id: lead ? 'u-kitchen' : 'u-member', lead_id: lead, performed_by_name: by,
      resolved_at: null, resolved_by_name: null, resolution_notes: null, ...extra,
    });
  l(1, 'filter_change', 140, 'Mid', 'Taylor', 'lead-2');
  l(2, 'filter_change', 135, 'Mid', 'Taylor', 'lead-2');
  l(3, 'filter_change', 60 * 15, 'Closing', 'Avery', 'lead-4');
  l(4, 'filter_change', 60 * 15, 'Closing', 'Avery', 'lead-4');
  l(3, 'issue', 110, 'Mid', 'Sam Lee', null, 'Oil is slow to come back up to temp after a drop');
  l(10, 'cleaning', 60 * 16, 'Closing', 'Avery', 'lead-4', 'Deep clean and delime');
  l(9, 'issue', 60 * 30, 'Mid', 'Morgan', 'lead-3', 'Door gasket torn on the left side', {
    status: 'resolved', resolved_at: minutesAgo(60 * 4), resolved_by_name: 'Alex Rivera', resolution_notes: 'Replaced gasket',
  });
  l(1, 'oil_change', 60 * 50, 'Closing', 'Avery', 'lead-4');

  return {
    profiles, hoh_leads: leads, checklist_templates: templates, checklist_items: items, checklist_checks: checks,
    waste_items: wasteItems, waste_entries: waste, equipment, equipment_logs: logs,
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

const CONFIG_TABLES = ['hoh_leads', 'checklist_templates', 'checklist_items', 'waste_items', 'equipment'];
const LOG_TABLES = ['checklist_checks', 'waste_entries', 'equipment_logs'];
const DEFAULTS: Record<string, Row> = {
  hoh_leads: { active: true, sort_order: 0 },
  checklist_templates: { shift: 'Any', active: true, sort_order: 0 },
  checklist_items: { active: true, sort_order: 0 },
  waste_items: { default_unit: 'each', active: true, sort_order: 0 },
  equipment: { category: 'Other', active: true, sort_order: 0 },
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
    let rows = db[this.table] ?? [];
    if (!isActive()) rows = this.table === 'profiles' ? rows.filter((r) => r.id === session!.user.id) : [];
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
          if (t === 'equipment_logs') {
            Object.assign(row, {
              logged_at: new Date().toISOString(), status: row.log_type === 'issue' ? 'open' : 'done',
              resolved_at: null, resolved_by_name: null, resolution_notes: null,
            });
          }
          created.push(row);
        }
        db[t].push(...created);
        persist();
        emit(t);
        return this.returning ? this.shape(created) : { data: null, error: null };
      }

      const targets = this.visible();

      if (this.op === 'update') {
        if (CONFIG_TABLES.includes(t) && !isManager()) return this.returning ? this.shape([]) : { data: null, error: null };
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
        const changed = targets.filter((r) => !LOG_TABLES.includes(t) || r.user_id === session!.user.id || isManager());
        changed.forEach((r) => Object.assign(r, patch));
        persist();
        emit(t);
        return this.returning ? this.shape(changed) : { data: null, error: null };
      }

      // delete
      let removable = targets;
      if (CONFIG_TABLES.includes(t)) removable = isManager() ? targets : [];
      else if (LOG_TABLES.includes(t)) removable = targets.filter((r) => r.user_id === session!.user.id || isManager());
      else if (t === 'profiles') removable = [];
      const ids = new Set(removable.map((r) => r.id));
      db[t] = db[t].filter((r) => !ids.has(r.id));
      // Cascades, like the real foreign keys.
      if (t === 'checklist_templates') {
        db.checklist_items = db.checklist_items.filter((r) => !ids.has(r.template_id));
        db.checklist_checks = db.checklist_checks.filter((r) => !ids.has(r.template_id));
      }
      if (t === 'checklist_items') db.checklist_checks = db.checklist_checks.filter((r) => !ids.has(r.item_id));
      if (t === 'equipment') db.equipment_logs = db.equipment_logs.filter((r) => !ids.has(r.equipment_id));
      if (t === 'hoh_leads') for (const lt of LOG_TABLES) db[lt].forEach((r) => ids.has(r.lead_id) && (r.lead_id = null));
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
      if (fn !== 'resolve_equipment_issue') return fail(`Unknown function ${fn}`);
      const name = actorName(args.p_lead_id ?? null);
      if (typeof name !== 'string') return name;
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
      signOut: async () => {
        setSession(null, 'SIGNED_OUT');
        return { error: null };
      },
    },
  };
}
