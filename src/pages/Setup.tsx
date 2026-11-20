import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorMessage } from '../lib/supabase';
import { formatClock } from '../lib/dates';
import {
  ROLE_LABELS,
  SCORES_VISIBILITY_LABELS,
  type ScoresVisibility,
  type NotifyKind,
  DEFAULT_SETTINGS,
  type AppSettings,
  type ChecklistItem,
  type ChecklistTemplate,
  type CleaningTask,
  type HohLead,
  type Profile,
  type Role,
  type WasteItem,
} from '../lib/types';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import { useConfirm } from '../components/Confirm';
import { PhotoPicker, PhotoThumb } from '../components/Photo';
import { usePositions } from '../lib/usePositions';
import { accountAction } from '../lib/passkeys';
import { removeFiles, uploadFile } from '../lib/files';
import { everyLabel } from '../lib/useCleaning';
import Fold from '../components/Fold';

type Tab = 'store' | 'scores' | 'leads' | 'checklists' | 'cleaning' | 'positions' | 'equipment' | 'team';

export default function Setup() {
  const { isAdmin } = useApp();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab = (raw === 'waste' ? 'equipment' : (raw as Tab)) || 'store';
  // Grouped by what an admin is trying to do; each tab says what's in it.
  const tabs: [Tab, string, string][] = [
    ['store', 'Store', 'Name, shift times, phone notifications'],
    ['team', 'People', 'Team accounts, roles and sign-in'],
    ['leads', 'HOH Leads', 'Names on the schedule and linked accounts'],
    ['scores', 'Lead scores', 'Who sees scores and what gets rated'],
    ['checklists', 'Checklists', 'HOH Lead checklists and photo tasks'],
    ['cleaning', 'Cleaning', 'Cleaning jobs for the Cleaning Hub: area, how often, which shift'],
    ['positions', 'Positions', 'Printed checklist for each position'],
    ['equipment', 'Waste Log', 'Items, reasons and units for the Waste Log'],
  ];
  const current = tabs.find((t) => t[0] === tab) ?? tabs[0];

  return (
    <div className="page sec-setup">
      <div className="page-title">
        <span className="page-icon"><Icon name="gear" size={22} /></span>
        <h1>Setup</h1>
      </div>
      <p className="muted lede">Only admins see Setup. Everything here changes the app for the whole store right away. No code needed.</p>
      <div className="tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setParams({ tab: k }, { replace: true })}>
            {label}
          </button>
        ))}
      </div>
      <p className="muted small tab-hint">{current[2]}</p>
      {tab === 'store' && <StoreEditor />}
      {tab === 'scores' && <ScoresSettings />}
      {tab === 'leads' && <LeadsEditor />}
      {tab === 'checklists' && <ChecklistsEditor />}
      {tab === 'cleaning' && <CleaningEditor />}
      {tab === 'positions' && <PositionsEditor />}
      {tab === 'equipment' && (
        <div className="stack">
          <WasteItemsEditor />
          <WasteOptions />
        </div>
      )}
      {tab === 'team' && isAdmin && <TeamEditor />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function useTable<T>(table: string, filter?: { column: string; value: string }) {
  const { toast } = useApp();
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const col = filter?.column;
  const val = filter?.value;

  const load = useCallback(async () => {
    let q = supabase.from(table).select('*');
    if (col && val) q = q.eq(col, val);
    const { data, error } = await q.order('sort_order').order('created_at');
    if (error) toast(errorMessage(error), 'error');
    setRows((data as T[]) ?? []);
    setLoading(false);
  }, [table, col, val, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(p: PromiseLike<{ error: unknown }>, ok?: string) {
    const { error } = await p;
    if (error) {
      toast(errorMessage(error), 'error');
      return false;
    }
    if (ok) toast(ok);
    await load();
    return true;
  }

  /** Move a row up or down by renumbering the whole list. */
  async function move(index: number, dir: -1 | 1) {
    const list = [...(rows as unknown as { id: string }[])];
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    const results = await Promise.all(list.map((r, i) => supabase.from(table).update({ sort_order: i + 1 }).eq('id', r.id)));
    await run(Promise.resolve({ error: results.find((r) => r.error)?.error ?? null }));
  }

  return { rows, loading, load, run, move };
}

function nextOrder(rows: { sort_order: number }[]) {
  return rows.reduce((m, r) => Math.max(m, r.sort_order), 0) + 1;
}

function InlineText({ value, onSave, label, className = 'inline-input' }: { value: string; onSave: (v: string) => void; label: string; className?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className={className}
      aria-label={label}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const t = v.trim();
        if (!t) setV(value);
        else if (t !== value) onSave(t);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function ActiveToggle({ active, onChange }: { active: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`toggle ${active ? 'toggle-on' : ''}`} title={active ? 'Shown in the app' : 'Hidden from the app'}>
      <input type="checkbox" checked={active} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true"><span /></span>
      <span>{active ? 'Shown' : 'Hidden'}</span>
    </label>
  );
}

function Reorder({ index, count, onMove }: { index: number; count: number; onMove: (i: number, d: -1 | 1) => void }) {
  return (
    <div className="reorder">
      <button className="icon-btn sm" onClick={() => onMove(index, -1)} disabled={index === 0} aria-label="Move up"><Icon name="up" size={16} /></button>
      <button className="icon-btn sm" onClick={() => onMove(index, 1)} disabled={index === count - 1} aria-label="Move down"><Icon name="down" size={16} /></button>
    </div>
  );
}

function AddRow({ placeholder, onAdd, children }: { placeholder: string; onAdd: (name: string) => Promise<boolean>; children?: ReactNode }) {
  const [name, setName] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (await onAdd(name.trim())) setName('');
  }
  return (
    <form className="add-row" onSubmit={submit}>
      <input placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} aria-label={placeholder} />
      {children}
      <button className="btn btn-primary" disabled={!name.trim()}>
        <Icon name="plus" size={18} /> Add
      </button>
    </form>
  );
}

function SectionIntro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="section-intro">
      <h2>{title}</h2>
      <p className="muted small">{children}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Store settings                                                      */
/* ------------------------------------------------------------------ */
function useSaveSettings() {
  const { toast } = useApp();
  return async (patch: Partial<AppSettings>, ok = 'Saved') => {
    const { error } = await supabase.from('app_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) {
      toast(errorMessage(error), 'error');
      return false;
    }
    toast(ok);
    return true;
  };
}

function StoreEditor() {
  const { settings } = useApp();
  const save = useSaveSettings();
  return (
    <div className="setup-grid">
      <section className="card">
        <SectionIntro title="Store name">Shown under the app name at the top of every screen.</SectionIntro>
        <InlineText className="big-input" label="Store name" value={settings.store_name} onSave={(store_name) => save({ store_name }, 'Store name saved')} />
      </section>

      <ShiftsEditor />

      <NotificationsEditor />
    </div>
  );
}

function ScoresSettings() {
  const { settings } = useApp();
  const save = useSaveSettings();
  return (
    <div className="setup-grid">
      <ScoresVisibilityEditor />
      <section className="card">
        <SectionIntro title="What the incoming shift rates">
          Each of these gets its own 1 to 5 stars when a shift rates the setup it walked into. The lead's score is the average. Remove them all to go back to one overall rating.
        </SectionIntro>
        <ListEditor items={settings.rating_categories} noun="category" onChange={(rating_categories) => save({ rating_categories })} />
      </section>
    </div>
  );
}

function WasteOptions() {
  const { settings } = useApp();
  const save = useSaveSettings();
  return (
    <div className="setup-grid">
      <section className="card">
        <SectionIntro title="Waste reasons">The reason buttons on the Waste Log.</SectionIntro>
        <ListEditor items={settings.waste_reasons} noun="reason" onChange={(waste_reasons) => save({ waste_reasons })} />
      </section>
      <section className="card">
        <SectionIntro title="Waste units">Units people can pick when logging waste.</SectionIntro>
        <ListEditor items={settings.waste_units} noun="unit" onChange={(waste_units) => save({ waste_units })} />
      </section>
    </div>
  );
}

function ScoresVisibilityEditor() {
  const { settings, isAdmin } = useApp();
  const save = useSaveSettings();
  const options: [ScoresVisibility, string][] = [
    ['directors', 'Only admins and directors can see ratings and lead scores.'],
    ['managers', 'Admins, directors and HOH Leads (accounts with the HOH Lead role) can see them.'],
    ['everyone', 'Everyone with an approved account can see them, including the shared kitchen device.'],
  ];
  return (
    <section className="card">
      <SectionIntro title="Who can see lead scores">
        Anyone can rate the previous shift. This controls who can see the stars, comments and the Lead Scores page.
        {!isAdmin && ' Only admins can change it.'}
      </SectionIntro>
      <div className="radio-list" role="radiogroup" aria-label="Who can see lead scores">
        {options.map(([key, hint]) => (
          <button
            key={key}
            role="radio"
            aria-checked={settings.scores_visibility === key}
            className={`radio-option ${settings.scores_visibility === key ? 'on' : ''}`}
            disabled={!isAdmin}
            onClick={() => save({ scores_visibility: key }, `Lead scores: ${SCORES_VISIBILITY_LABELS[key]}`)}
          >
            <span className="radio-dot" aria-hidden="true" />
            <span><strong>{SCORES_VISIBILITY_LABELS[key]}</strong><small>{hint}</small></span>
          </button>
        ))}
      </div>
    </section>
  );
}

const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'];

const NOTIFY_KINDS: [NotifyKind, string, string][] = [
  ['schedule', 'Schedule sent', 'When you send the Lead Schedule, each lead hears about their own shifts.'],
  ['reminder', 'Shift reminder', 'The scheduled lead gets a reminder an hour before their shift starts.'],
  ['handoff_missed', 'Handoff reminder', 'If a shift’s handoff isn’t submitted 30 minutes after the shift ends, its lead gets a reminder.'],
  ['requests', 'Broken or needed', 'Directors and admins hear when someone posts something broken or something the kitchen needs.'],
  ['ratings', 'Shift rated', 'A lead hears when their shift is rated. The stars are included only if leads can see scores (Setup → Lead scores).'],
];

function NotificationsEditor() {
  const { settings } = useApp();
  const save = useSaveSettings();
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = [...new Set([...TIMEZONES, device, settings.timezone])];
  return (
    <section className="card">
      <SectionIntro title="Phone notifications">
        Each notification only goes to the people it's about. A lead who is off gets nothing.
        To get them, a lead needs their own account linked to their name (Setup → HOH Leads), and everyone turns notifications on in Account on their own phone.
      </SectionIntro>
      <label className={`toggle ${settings.notifications_enabled ? 'toggle-on' : ''}`}>
        <input
          type="checkbox"
          checked={settings.notifications_enabled}
          onChange={(e) => save(e.target.checked ? { notifications_enabled: true, timezone: device || settings.timezone } : { notifications_enabled: false }, e.target.checked ? 'Notifications are on' : 'Notifications are off')}
        />
        <span className="toggle-track" aria-hidden="true"><span /></span>
        <span>{settings.notifications_enabled ? 'On' : 'Off'}</span>
      </label>
      {settings.notifications_enabled && (
        <ul className="notify-kinds">
          {NOTIFY_KINDS.map(([k, label, hint]) => {
            const on = settings.notify_kinds?.[k] !== false;
            return (
              <li key={k}>
                <label className={`toggle ${on ? 'toggle-on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={(e) => save({ notify_kinds: { ...DEFAULT_SETTINGS.notify_kinds, ...settings.notify_kinds, [k]: e.target.checked } }, `${label}: ${e.target.checked ? 'on' : 'off'}`)} />
                  <span className="toggle-track" aria-hidden="true"><span /></span>
                  <span><strong>{label}</strong><small>{hint}</small></span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {settings.notifications_enabled && (
        <label className="field">
          <span>Store time zone (for the reminder an hour before each shift)</span>
          <select value={settings.timezone} onChange={(e) => save({ timezone: e.target.value }, 'Time zone saved')}>
            {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
      )}
    </section>
  );
}

function ShiftsEditor() {
  const { settings, shift, shiftNames, toast } = useApp();
  const save = useSaveSettings();

  async function rename(i: number, name: string) {
    const old = settings.shifts[i].name;
    if (shiftNames.some((n, j) => j !== i && n.toLowerCase() === name.toLowerCase())) return toast('Each shift needs a different name', 'error');
    if (!(await save({ shifts: settings.shifts.map((x, j) => (j === i ? { ...x, name } : x)) }, `Renamed ${old} to ${name}`))) return;
    // Keep lead checklists on the renamed shift.
    await supabase.from('checklist_templates').update({ shift: name }).eq('shift', old);
  }

  return (
    <section className="card">
      <SectionIntro title="Shifts">
        Your two shifts. The app switches from one to the other automatically at each start time.
      </SectionIntro>
      <ul className="edit-list shift-list">
        {settings.shifts.map((s, i) => (
          <li key={`${s.name}-${i}`}>
            <span className={`shift-chip tone-${i === 0 ? 'sunrise' : 'dusk'}`} aria-hidden="true" />
            <InlineText label="Shift name" value={s.name} onSave={(v) => rename(i, v)} />
            <label className="time-field">
              <span>Starts</span>
              <input
                type="time"
                value={s.start}
                onChange={(e) =>
                  e.target.value &&
                  save(
                    { shifts: settings.shifts.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)).sort((x, y) => x.start.localeCompare(y.start)) },
                    `${s.name} now starts at ${formatClock(e.target.value)}`,
                  )
                }
              />
            </label>
            {s.name === shift && <span className="pill pill-accent">Now</span>}
          </li>
        ))}
        <li>
          <span className="shift-chip tone-night" aria-hidden="true" />
          <span className="inline-label">Close-out done by</span>
          <label className="time-field">
            <span className="sr-only">Close-out done by</span>
            <input type="time" value={settings.close_time} onChange={(e) => e.target.value && save({ close_time: e.target.value }, `Close-out done by ${formatClock(e.target.value)}`)} />
          </label>
        </li>
      </ul>
      <p className="muted small">The last shift ends at close-out. Used for the handoff reminder and to show each shift’s hours on Home.</p>
    </section>
  );
}

function ListEditor({ items, noun, onChange }: { items: string[]; noun: string; onChange: (list: string[]) => void }) {
  const confirm = useConfirm();
  const move = (i: number, d: -1 | 1) => {
    const list = [...items];
    [list[i], list[i + d]] = [list[i + d], list[i]];
    onChange(list);
  };
  return (
    <>
      <ul className="edit-list">
        {items.map((it, i) => (
          <li key={`${it}-${i}`}>
            <Reorder index={i} count={items.length} onMove={move} />
            <InlineText label={noun} value={it} onSave={(v) => onChange(items.map((x, j) => (j === i ? v : x)))} />
            <button
              className="icon-btn"
              aria-label={`Remove ${it}`}
              onClick={async () => {
                if (await confirm({ title: `Remove "${it}"?`, body: 'Past entries that used it keep it.', confirmLabel: 'Remove', danger: true })) {
                  onChange(items.filter((_, j) => j !== i));
                }
              }}
            >
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
      </ul>
      <AddRow
        placeholder={`Add ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`}
        onAdd={async (v) => {
          if (items.some((x) => x.toLowerCase() === v.toLowerCase())) return false;
          onChange([...items, v]);
          return true;
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* HOH Leads                                                           */
/* ------------------------------------------------------------------ */
function LeadsEditor() {
  const { rows, run, move } = useTable<HohLead>('hoh_leads');
  const { isAdmin } = useApp();
  const confirm = useConfirm();
  const [people, setPeople] = useState<Profile[]>([]);
  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from('profiles')
      .select('*')
      .order('full_name')
      .then(({ data }) => setPeople(((data as Profile[]) ?? []).filter((p) => p.role !== 'pending' && p.role !== 'kitchen')));
  }, [isAdmin]);
  return (
    <section className="card">
      <SectionIntro title="HOH Leads">
        The names the shared kitchen device can pick as Shift Lead. Ratings of each shift are credited to its Shift Lead. Hide a lead who has left to keep their score history.
        {isAdmin && ' If a lead has their own account, link it so handoffs they submit from their phone count for them.'}
      </SectionIntro>
      <AddRow placeholder="Lead's name" onAdd={(name) => run(supabase.from('hoh_leads').insert({ name, sort_order: nextOrder(rows) }), `Added ${name}`)} />
      {rows.length === 0 ? (
        <p className="empty">No leads yet. Add your HOH Leads above.</p>
      ) : (
        <ul className="edit-list">
          {rows.map((l, i) => (
            <li key={l.id} className={l.active ? '' : 'inactive'}>
              <Reorder index={i} count={rows.length} onMove={move} />
              <InlineText label="Lead name" value={l.name} onSave={(name) => run(supabase.from('hoh_leads').update({ name }).eq('id', l.id))} />
              {isAdmin && (
                <select
                  className="link-select"
                  aria-label={`Account linked to ${l.name}`}
                  value={l.profile_id ?? ''}
                  onChange={(e) => run(supabase.from('hoh_leads').update({ profile_id: e.target.value || null }).eq('id', l.id), e.target.value ? 'Account linked' : 'Account unlinked')}
                >
                  <option value="">No linked account</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id} disabled={rows.some((r) => r.profile_id === p.id && r.id !== l.id)}>
                      {p.full_name || 'Unnamed'} ({ROLE_LABELS[p.role]})
                    </option>
                  ))}
                </select>
              )}
              <ActiveToggle active={l.active} onChange={(active) => run(supabase.from('hoh_leads').update({ active }).eq('id', l.id))} />
              <button
                className="icon-btn"
                aria-label={`Delete ${l.name}`}
                onClick={async () => {
                  if (await confirm({ title: `Delete ${l.name}?`, body: 'Their ratings would no longer count toward a lead score. To keep their score history, hide them instead.', confirmLabel: 'Delete', danger: true })) {
                    run(supabase.from('hoh_leads').delete().eq('id', l.id), 'Deleted');
                  }
                }}
              >
                <Icon name="trash" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Checklists                                                          */
/* ------------------------------------------------------------------ */
function ChecklistsEditor() {
  const { rows: templates, run, move } = useTable<ChecklistTemplate>('checklist_templates');
  const [selected, setSelected] = useState<string | null>(null);
  const current = templates.find((t) => t.id === selected) ?? templates[0] ?? null;

  return (
    <div className="two-col setup-cols">
      <section className="card">
        <SectionIntro title="HOH Lead checklists">The few checklists the HOH Lead must complete in the app. Pick one to edit it. Changes save as you go.</SectionIntro>
        <AddRow
          placeholder="New checklist name"
          onAdd={async (name) => {
            const { data, error } = await supabase
              .from('checklist_templates')
              .insert({ name, shift: 'Any', frequency: 'daily', sort_order: nextOrder(templates) })
              .select()
              .single();
            const ok = await run(Promise.resolve({ error }), `Created ${name}`);
            if (ok && data) setSelected((data as ChecklistTemplate).id);
            return ok;
          }}
        />
        <ul className="pick-list">
          {templates.map((t, i) => (
            <li key={t.id} className="pick-row">
              <button className={`pick ${current?.id === t.id ? 'on' : ''} ${t.active ? '' : 'inactive'}`} onClick={() => setSelected(t.id)}>
                <span>{t.name}</span>
                <span className="muted small">
                  {t.shift === 'Any' ? 'Any shift' : t.shift} · {t.frequency === 'weekly' ? 'Weekly' : 'Daily'}
                  {t.active ? '' : ' · hidden'}
                </span>
              </button>
              <Reorder index={i} count={templates.length} onMove={move} />
            </li>
          ))}
        </ul>
      </section>

      {current && <TemplateEditor key={current.id} template={current} onChanged={() => run(Promise.resolve({ error: null }))} onCreated={setSelected} />}
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map(([k, text]) => (
          <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => value !== k && onChange(k)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

function TemplateEditor({ template, onChanged, onCreated }: { template: ChecklistTemplate; onChanged: () => void; onCreated: (id: string) => void }) {
  const { toast, shiftNames } = useApp();
  const confirm = useConfirm();
  const { rows, run, load } = useTable<ChecklistItem>('checklist_items', { column: 'template_id', value: template.id });
  const items = rows.filter((i) => i.active);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(false);

  async function updateTemplate(patch: Partial<ChecklistTemplate>) {
    const { error } = await supabase.from('checklist_templates').update(patch).eq('id', template.id);
    if (error) return toast(errorMessage(error), 'error');
    onChanged();
  }

  /** One task per line, so a whole list can be typed or pasted in one go. */
  async function addTasks(e: FormEvent) {
    e.preventDefault();
    const labels = text.split('\n').map((l) => l.replace(/^[\s\-•*\d.)\]\[]+/, '').trim()).filter(Boolean);
    if (labels.length === 0) return;
    const start = nextOrder(rows);
    const ok = await run(
      supabase.from('checklist_items').insert(labels.map((label, i) => ({ template_id: template.id, label, requires_photo: photo, sort_order: start + i }))),
      labels.length > 1 ? `Added ${labels.length} tasks` : undefined,
    );
    if (ok) setText('');
  }

  async function moveTask(index: number, dir: -1 | 1) {
    const list = [...items];
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    await Promise.all(list.map((r, i) => supabase.from('checklist_items').update({ sort_order: i + 1 }).eq('id', r.id)));
    await load();
  }

  async function removeTask(it: ChecklistItem) {
    // Hidden rather than deleted, so past check-offs stay in the record.
    await supabase.from('checklist_items').update({ active: false }).eq('id', it.id);
    await load();
    toast(`Removed “${it.label}”`, 'ok', {
      undo: async () => {
        await supabase.from('checklist_items').update({ active: true }).eq('id', it.id);
        await load();
      },
    });
  }

  async function duplicate() {
    const { data, error } = await supabase
      .from('checklist_templates')
      .insert({ name: `${template.name} (copy)`, shift: template.shift, frequency: template.frequency, sort_order: template.sort_order + 1 })
      .select()
      .single();
    if (error || !data) return toast(errorMessage(error), 'error');
    const id = (data as ChecklistTemplate).id;
    if (items.length) await supabase.from('checklist_items').insert(items.map((i) => ({ template_id: id, label: i.label, requires_photo: i.requires_photo, sort_order: i.sort_order })));
    toast('Copied. Rename it and change the shift.');
    onChanged();
    onCreated(id);
  }

  const shiftOptions = [...new Set([...shiftNames, 'Any', template.shift])].map((s) => [s, s === 'Any' ? 'Any shift' : s] as [string, string]);

  return (
    <section className="card builder">
      <label className="field">
        <span>Checklist name</span>
        <InlineText className="big-input" label="Checklist name" value={template.name} onSave={(name) => updateTemplate({ name })} />
      </label>
      <div className="field-row">
        <Segmented label="Shift" value={template.shift} options={shiftOptions} onChange={(shift) => updateTemplate({ shift })} />
        <Segmented label="Repeats" value={template.frequency} options={[['daily', 'Every day'], ['weekly', 'Every week']]} onChange={(frequency) => updateTemplate({ frequency })} />
      </div>

      <h3>Tasks {items.length > 0 && <span className="muted small">({items.length})</span>}</h3>
      {items.length === 0 ? (
        <p className="empty">No tasks yet. Type them below, one per line.</p>
      ) : (
        <ul className="edit-list task-list">
          {items.map((it, i) => (
            <li key={it.id}>
              <Reorder index={i} count={items.length} onMove={moveTask} />
              <InlineText label="Task" value={it.label} onSave={(label) => run(supabase.from('checklist_items').update({ label }).eq('id', it.id))} />
              <button
                type="button"
                className={`photo-chip ${it.requires_photo ? 'on' : ''}`}
                aria-pressed={it.requires_photo}
                title={it.requires_photo ? 'A photo is required to check this off. Tap to turn off.' : 'Tap to require a photo for this task'}
                onClick={() => run(supabase.from('checklist_items').update({ requires_photo: !it.requires_photo }).eq('id', it.id))}
              >
                <Icon name="camera" size={16} /> {it.requires_photo ? 'Photo required' : 'Ask for a photo'}
              </button>
              <button className="icon-btn" aria-label={`Remove ${it.label}`} onClick={() => removeTask(it)}><Icon name="x" size={18} /></button>
            </li>
          ))}
        </ul>
      )}

      <form className="task-add" onSubmit={addTasks}>
        <textarea
          rows={Math.min(8, Math.max(2, text.split('\n').length))}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !text.includes('\n')) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={'Type a task and press Enter.\nOr paste a whole list, one task per line.'}
          aria-label="New tasks, one per line"
        />
        <div className="row-between wrap">
          <label className={`toggle ${photo ? 'toggle-on' : ''}`}>
            <input type="checkbox" checked={photo} onChange={(e) => setPhoto(e.target.checked)} />
            <span className="toggle-track" aria-hidden="true"><span /></span>
            <span>Ask for a photo</span>
          </label>
          <button className="btn btn-primary" disabled={!text.trim()}><Icon name="plus" size={18} /> Add {text.includes('\n') ? 'tasks' : 'task'}</button>
        </div>
      </form>

      <div className="builder-foot">
        <ActiveToggle active={template.active} onChange={(active) => updateTemplate({ active })} />
        <button className="btn btn-ghost btn-sm" onClick={duplicate}><Icon name="copy" size={16} /> Make a copy</button>
        <button
          className="btn btn-ghost btn-sm text-danger"
          onClick={async () => {
            if (!(await confirm({ title: `Delete "${template.name}"?`, body: 'This also deletes all of its check-off history. To keep history, hide it instead.', confirmLabel: 'Delete checklist', danger: true }))) return;
            const { error } = await supabase.from('checklist_templates').delete().eq('id', template.id);
            if (error) return toast(errorMessage(error), 'error');
            toast('Checklist deleted');
            onChanged();
          }}
        >
          <Icon name="trash" size={16} /> Delete
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Cleaning Hub jobs                                                   */
/* ------------------------------------------------------------------ */
const EVERY: [number, string][] = [[1, 'Every day'], [2, 'Every other day'], [7, 'Every week'], [14, 'Every 2 weeks'], [30, 'Every month'], [90, 'Every 3 months']];

function EverySelect({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const options = EVERY.some(([d]) => d === value) ? EVERY : [...EVERY, [value, everyLabel(value)] as [number, string]];
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label}>
      {options.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
    </select>
  );
}

function CleaningEditor() {
  const { shiftNames, toast } = useApp();
  const { rows, run, load } = useTable<CleaningTask>('cleaning_tasks');
  const active = rows.filter((r) => r.active);
  const hidden = rows.filter((r) => !r.active);
  const areas = [...new Set(rows.map((r) => r.area))];
  const [text, setText] = useState('');
  const [area, setArea] = useState('Kitchen');
  const [every, setEvery] = useState(1);
  const [shift, setShift] = useState('Any');
  const [photo, setPhoto] = useState(false);
  const [editing, setEditing] = useState<CleaningTask | null>(null);
  const shiftOptions = [...shiftNames, 'Any'];

  async function add(e: FormEvent) {
    e.preventDefault();
    const names = text.split('\n').map((l) => l.replace(/^[\s\-•*\d.)\]\[]+/, '').trim()).filter(Boolean);
    if (!names.length) return;
    const start = nextOrder(rows);
    const ok = await run(
      supabase.from('cleaning_tasks').insert(names.map((name, i) => ({ name, area: area.trim() || 'Kitchen', every_days: every, shift, requires_photo: photo, sort_order: start + i }))),
      `Added ${names.length} cleaning job${names.length === 1 ? '' : 's'}`,
    );
    if (ok) setText('');
  }

  async function hide(t: CleaningTask) {
    await supabase.from('cleaning_tasks').update({ active: false }).eq('id', t.id);
    await load();
    toast(`Removed “${t.name}”`, 'ok', {
      undo: async () => {
        await supabase.from('cleaning_tasks').update({ active: true }).eq('id', t.id);
        await load();
      },
    });
  }

  return (
    <div className="stack">
      <section className="card builder">
        <SectionIntro title="Add cleaning jobs">
          Type one job per line (or paste a list). Pick the area, how often it needs doing, and which shift does it. The Cleaning Hub works out what's due each day.
        </SectionIntro>
        <form className="task-add" onSubmit={add}>
          <textarea
            rows={Math.min(8, Math.max(2, text.split('\n').length))}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'e.g. Degrease the hood filters\nScrub the floor drains'}
            aria-label="New cleaning jobs, one per line"
          />
          <div className="field-row">
            <label className="field">
              <span>Area</span>
              <input list="clean-areas" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Fryers" />
            </label>
            <label className="field">
              <span>How often</span>
              <EverySelect value={every} onChange={setEvery} label="How often" />
            </label>
          </div>
          <Segmented label="Which shift does it" value={shift} options={shiftOptions.map((s) => [s, s === 'Any' ? 'Any shift' : s] as [string, string])} onChange={setShift} />
          <div className="row-between wrap">
            <label className={`toggle ${photo ? 'toggle-on' : ''}`}>
              <input type="checkbox" checked={photo} onChange={(e) => setPhoto(e.target.checked)} />
              <span className="toggle-track" aria-hidden="true"><span /></span>
              <span>Ask for a photo</span>
            </label>
            <button className="btn btn-primary" disabled={!text.trim()}><Icon name="plus" size={18} /> Add {text.includes('\n') ? 'jobs' : 'job'}</button>
          </div>
        </form>
        <datalist id="clean-areas">{areas.map((a) => <option key={a} value={a} />)}</datalist>
      </section>

      {areas.filter((a) => active.some((t) => t.area === a)).map((a) => (
        <section key={a} className="card">
          <h3 className="clean-area-title">{a} <span className="muted small">({active.filter((t) => t.area === a).length})</span></h3>
          <ul className="edit-list clean-edit-list">
            {active.filter((t) => t.area === a).map((t) => (
              <li key={t.id}>
                <InlineText label="Job" value={t.name} onSave={(name) => run(supabase.from('cleaning_tasks').update({ name }).eq('id', t.id))} />
                <EverySelect value={t.every_days} label={`How often: ${t.name}`} onChange={(every_days) => run(supabase.from('cleaning_tasks').update({ every_days }).eq('id', t.id), `${t.name}: ${everyLabel(every_days).toLowerCase()}`)} />
                <select value={t.shift} aria-label={`Shift for ${t.name}`} onChange={(e) => run(supabase.from('cleaning_tasks').update({ shift: e.target.value }).eq('id', t.id))}>
                  {[...new Set([...shiftOptions, t.shift])].map((s) => <option key={s} value={s}>{s === 'Any' ? 'Any shift' : `${s} shift`}</option>)}
                </select>
                <button
                  type="button"
                  className={`photo-chip ${t.requires_photo ? 'on' : ''}`}
                  aria-pressed={t.requires_photo}
                  onClick={() => run(supabase.from('cleaning_tasks').update({ requires_photo: !t.requires_photo }).eq('id', t.id))}
                >
                  <Icon name="camera" size={16} /> {t.requires_photo ? 'Photo required' : 'Ask for a photo'}
                </button>
                <button className="icon-btn" aria-label={`More for ${t.name}`} onClick={() => setEditing(t)}><Icon name="edit" size={18} /></button>
                <button className="icon-btn" aria-label={`Remove ${t.name}`} onClick={() => hide(t)}><Icon name="x" size={18} /></button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {hidden.length > 0 && (
        <Fold title={`Removed jobs (${hidden.length})`} summary="Bring one back">
          <ul className="edit-list">
            {hidden.map((t) => (
              <li key={t.id} className="inactive">
                <span className="grow">{t.name} <span className="muted small">· {t.area}</span></span>
                <button className="btn btn-ghost btn-sm" onClick={() => run(supabase.from('cleaning_tasks').update({ active: true }).eq('id', t.id), `Brought back ${t.name}`)}>Bring back</button>
              </li>
            ))}
          </ul>
        </Fold>
      )}

      {editing && <CleaningJobSheet task={editing} areas={areas} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function CleaningJobSheet({ task, areas, onClose, onSaved }: { task: CleaningTask; areas: string[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [area, setArea] = useState(task.area);
  const [instructions, setInstructions] = useState(task.instructions ?? '');
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const { error } = await supabase.from('cleaning_tasks').update({ area: area.trim() || task.area, instructions: instructions.trim() || null }).eq('id', task.id);
    setSaving(false);
    if (error) return toast(errorMessage(error), 'error');
    toast('Saved');
    onSaved();
  }
  return (
    <Modal title={task.name} onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Area</span>
          <input list="clean-areas-sheet" value={area} onChange={(e) => setArea(e.target.value)} />
          <datalist id="clean-areas-sheet">{areas.map((a) => <option key={a} value={a} />)}</datalist>
        </label>
        <label className="field">
          <span>How to do it (optional)</span>
          <textarea rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Soak filters in degreaser for 20 minutes, rinse, let dry before putting back." />
        </label>
        <button className="btn btn-primary btn-block" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Waste items                                                         */
/* ------------------------------------------------------------------ */
function WasteItemsEditor() {
  const { settings } = useApp();
  const { rows, run, move } = useTable<WasteItem>('waste_items');
  const confirm = useConfirm();
  const [unit, setUnit] = useState(settings.waste_units[0] ?? 'each');
  return (
    <section className="card">
      <SectionIntro title="Waste items">Quick-pick buttons on the Waste Log. People can still type any other item.</SectionIntro>
      <AddRow placeholder="Item name" onAdd={(name) => run(supabase.from('waste_items').insert({ name, default_unit: unit, sort_order: nextOrder(rows) }), `Added ${name}`)}>
        <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Default unit">
          {settings.waste_units.map((u) => <option key={u}>{u}</option>)}
        </select>
      </AddRow>
      <ul className="edit-list">
        {rows.map((w, i) => (
          <li key={w.id} className={w.active ? '' : 'inactive'}>
            <Reorder index={i} count={rows.length} onMove={move} />
            <InlineText label="Item name" value={w.name} onSave={(name) => run(supabase.from('waste_items').update({ name }).eq('id', w.id))} />
            <select value={w.default_unit} onChange={(e) => run(supabase.from('waste_items').update({ default_unit: e.target.value }).eq('id', w.id))} aria-label="Default unit">
              {[...new Set([...settings.waste_units, w.default_unit])].map((u) => <option key={u}>{u}</option>)}
            </select>
            <ActiveToggle active={w.active} onChange={(active) => run(supabase.from('waste_items').update({ active }).eq('id', w.id))} />
            <button
              className="icon-btn"
              aria-label={`Delete ${w.name}`}
              onClick={async () => {
                if (await confirm({ title: `Delete ${w.name}?`, body: 'Past waste entries are kept.', confirmLabel: 'Delete', danger: true })) {
                  run(supabase.from('waste_items').delete().eq('id', w.id));
                }
              }}
            >
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Positions (attach the physical checklist)                           */
/* ------------------------------------------------------------------ */
function PositionsEditor() {
  const { positions, filesFor, reload } = usePositions(true);
  const { toast } = useApp();
  const confirm = useConfirm();
  const [selected, setSelected] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const current = positions.find((p) => p.id === selected) ?? positions[0] ?? null;
  const files = current ? filesFor(current.id) : [];

  async function run(p: PromiseLike<{ error: unknown }>, ok?: string) {
    const { error } = await p;
    if (error) return toast(errorMessage(error), 'error'), false;
    if (ok) toast(ok);
    await reload();
    return true;
  }

  async function move(index: number, dir: -1 | 1) {
    const list = [...positions];
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    const results = await Promise.all(list.map((r, i) => supabase.from('positions').update({ sort_order: i + 1 }).eq('id', r.id)));
    await run(Promise.resolve({ error: results.find((r) => r.error)?.error ?? null }));
  }

  async function attach(list: File[]) {
    if (!current) return;
    setUploading(true);
    let added = 0;
    for (const f of list) {
      try {
        const { path, contentType } = await uploadFile(`positions/${current.id}`, f);
        const { error } = await supabase.from('position_files').insert({ position_id: current.id, path, file_name: f.name || 'Checklist', content_type: contentType });
        if (error) throw error;
        added++;
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    }
    setUploading(false);
    if (added) toast(`Attached ${added} file${added > 1 ? 's' : ''} to ${current.name}`);
    reload();
  }

  return (
    <div className="two-col setup-cols">
      <section className="card">
        <SectionIntro title="Positions">Each kitchen position and its printed checklist. Attach a photo or PDF of the paper checklist.</SectionIntro>
        <AddRow
          placeholder="New position, e.g. Breading"
          onAdd={async (name) => {
            const { data, error } = await supabase.from('positions').insert({ name, sort_order: positions.length + 1 }).select().single();
            const ok = await run(Promise.resolve({ error }), `Added ${name}`);
            if (ok && data) setSelected((data as { id: string }).id);
            return ok;
          }}
        />
        <ul className="pick-list">
          {positions.map((p, i) => (
            <li key={p.id} className="pick-row">
              <button className={`pick ${current?.id === p.id ? 'on' : ''} ${p.active ? '' : 'inactive'}`} onClick={() => setSelected(p.id)}>
                <span>{p.name}</span>
                <span className="muted small">{filesFor(p.id).length || 'No'} file{filesFor(p.id).length === 1 ? '' : 's'}{p.active ? '' : ' · hidden'}</span>
              </button>
              <Reorder index={i} count={positions.length} onMove={move} />
            </li>
          ))}
        </ul>
      </section>

      {current && (
        <section className="card" key={current.id}>
          <label className="field">
            <span>Position name</span>
            <InlineText className="big-input" label="Position name" value={current.name} onSave={(name) => run(supabase.from('positions').update({ name }).eq('id', current.id), 'Saved')} />
          </label>
          <label className="field">
            <span>Notes for this position (optional)</span>
            <textarea
              rows={2}
              defaultValue={current.description ?? ''}
              placeholder="e.g. Ask the HOH Lead for the laminated copy if the printout is missing."
              onBlur={(e) => {
                const v = e.target.value.trim() || null;
                if (v !== (current.description ?? null)) run(supabase.from('positions').update({ description: v }).eq('id', current.id), 'Saved');
              }}
            />
          </label>
          <div className="field">
            <span>Checklist files</span>
            <div className="photo-grid">
              {files.map((f) => (
                <PhotoThumb
                  key={f.id}
                  path={f.path}
                  contentType={f.content_type}
                  label={f.file_name}
                  onDelete={async () => {
                    if (!(await confirm({ title: `Remove ${f.file_name}?`, confirmLabel: 'Remove', danger: true }))) return;
                    if (await run(supabase.from('position_files').delete().eq('id', f.id), 'File removed')) await removeFiles([f.path]);
                  }}
                />
              ))}
              <PhotoPicker onFiles={attach} busy={uploading} accept="image/*,application/pdf" className="photo-add">
                Attach photo or PDF
              </PhotoPicker>
            </div>
            <p className="muted small">Tip: lay the paper checklist flat in good light and take the photo straight on.</p>
          </div>
          <div className="row-between wrap">
            <ActiveToggle active={current.active} onChange={(active) => run(supabase.from('positions').update({ active }).eq('id', current.id))} />
            <button
              className="btn btn-ghost btn-sm text-danger"
              onClick={async () => {
                if (!(await confirm({ title: `Delete ${current.name}?`, body: 'Its attached files are removed too.', confirmLabel: 'Delete position', danger: true }))) return;
                const paths = files.map((f) => f.path);
                if (await run(supabase.from('positions').delete().eq('id', current.id), 'Position deleted')) await removeFiles(paths);
              }}
            >
              <Icon name="trash" size={16} /> Delete position
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Team (admins only)                                                  */
/* ------------------------------------------------------------------ */
function TeamEditor() {
  const { toast, profile: me, refreshProfile } = useApp();
  const [people, setPeople] = useState<Profile[]>([]);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at');
    if (error) toast(errorMessage(error), 'error');
    const list = (data as Profile[]) ?? [];
    list.sort((a, b) => Number(b.role === 'pending') - Number(a.role === 'pending'));
    setPeople(list);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function update(p: Profile, patch: Partial<Profile>, ok: string) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', p.id);
    if (error) return toast(errorMessage(error), 'error');
    toast(ok);
    if (p.id === me?.id) refreshProfile();
    load();
  }

  const pending = people.filter((p) => p.role === 'pending').length;
  const [settingPassword, setSettingPassword] = useState<Profile | null>(null);
  const [coding, setCoding] = useState<Profile | null>(null);
  const confirm = useConfirm();
  const [methods, setMethods] = useState<Record<string, { email: string | null; passkeys: number | null }>>({});

  const loadMethods = useCallback(async () => {
    const { data } = await accountAction<{ people: { userId: string; email: string | null; passkeys: number | null }[] }>({ action: 'team' });
    if (data) setMethods(Object.fromEntries(data.people.map((p) => [p.userId, { email: p.email, passkeys: p.passkeys }])));
  }, []);
  useEffect(() => {
    loadMethods();
  }, [loadMethods]);

  const admins = people.filter((p) => p.is_admin && p.role !== 'pending').length;

  async function setAdmin(p: Profile, on: boolean) {
    const name = p.full_name || 'this person';
    if (on) {
      const ok = await confirm({
        title: `Make ${name} an admin?`,
        body: 'Admins can open Setup and change the app for everyone: HOH Leads, checklists, positions, equipment, store settings, team accounts and roles, and who sees lead scores.',
        confirmLabel: 'Make admin',
      });
      if (ok) update(p, { is_admin: true }, `${name} is now an admin`);
    } else {
      if (admins <= 1) return toast('There must be at least one admin. Make someone else an admin first.', 'error');
      const self = p.id === me?.id;
      const ok = await confirm({
        title: self ? 'Stop being an admin?' : `Remove ${name} as admin?`,
        body: self ? 'You will lose access to Setup right away. Another admin can switch it back on.' : `${name} keeps their role but can't change the app's setup anymore.`,
        confirmLabel: self ? 'Stop being an admin' : 'Remove admin',
        danger: true,
      });
      if (ok) update(p, { is_admin: false }, self ? 'You are no longer an admin' : `${name} is no longer an admin`);
    }
  }

  function setRole(p: Profile, role: Role) {
    const name = p.full_name || 'User';
    // A shared device or someone waiting for approval can't configure the app.
    const dropAdmin = p.is_admin && (role === 'pending' || role === 'kitchen');
    if (dropAdmin && admins <= 1) return toast('There must be at least one admin. Make someone else an admin first.', 'error');
    update(p, dropAdmin ? { role, is_admin: false } : { role }, `${name} is now ${ROLE_LABELS[role]}${dropAdmin ? ' (admin switched off)' : ''}`);
  }

  async function deleteAccount(p: Profile) {
    const name = p.full_name || 'this account';
    const ok = await confirm({
      title: `Delete ${name}?`,
      body: 'Their sign-in, passkeys and profile are removed for good. Checklists, waste entries, notes, handoffs and ratings they logged stay, with their name on them. To pause someone instead, set their role to "No access".',
      confirmLabel: 'Delete account',
      danger: true,
    });
    if (!ok) return;
    const { error } = await accountAction({ action: 'delete-user', userId: p.id });
    if (error) return toast(error, 'error');
    toast(`Deleted ${name}`);
    load();
    loadMethods();
  }

  async function removePasskeys(p: Profile) {
    if (!(await confirm({ title: `Remove ${p.full_name || 'their'}'s passkeys?`, body: 'Use this if a phone or tablet is lost or replaced. They will need a sign-in code to set up a new passkey.', confirmLabel: 'Remove passkeys', danger: true }))) return;
    const { data, error } = await accountAction<{ removed: number }>({ action: 'remove-passkeys', userId: p.id });
    if (error) return toast(error, 'error');
    toast(`Removed ${data?.removed ?? 0} passkey${data?.removed === 1 ? '' : 's'}`);
    loadMethods();
  }

  return (
    <section className="card">
      <SectionIntro title="Team accounts">
        New sign-ups wait here until you give them a role. Use "Shared Kitchen Device" for the store tablet's login. Set someone to "No access" to remove their access.
        Switch on <strong>Admin</strong> for the people who should configure the app; a role alone (even Director) doesn't open Setup.
        Everyone signs in with a passkey. For a new or replaced phone or tablet, give the person a one-time sign-in code.
      </SectionIntro>
      {pending > 0 && <div className="banner banner-warn"><Icon name="alert" /> {pending} {pending === 1 ? 'person is' : 'people are'} waiting for approval.</div>}
      <ul className="edit-list">
        {people.map((p) => (
          <li key={p.id} className={p.role === 'pending' ? 'highlight' : ''}>
            <div className="person">
              <span className="avatar" aria-hidden="true">{(p.full_name || '?').slice(0, 1).toUpperCase()}</span>
              <div className="grow">
                <InlineText label="Name" value={p.full_name || ''} onSave={(full_name) => update(p, { full_name }, 'Name updated')} />
                <div className="muted small person-meta">
                  Joined {new Date(p.created_at).toLocaleDateString()}
                  {p.id === me?.id && <span className="pill">You</span>}
                  {p.is_admin && p.role !== 'pending' && <span className="pill pill-admin"><Icon name="gear" size={12} /> Admin</span>}
                  {methods[p.id] && (
                    <span className="signin-methods">
                      {methods[p.id].passkeys ? (
                        <span className="pill pill-ok"><Icon name="key" size={12} /> {methods[p.id].passkeys} passkey{methods[p.id].passkeys === 1 ? '' : 's'}</span>
                      ) : (
                        <span className="pill pill-warn">No passkey yet</span>
                      )}
                      {methods[p.id].email && <span className="pill">Email</span>}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="person-access">
              <select value={p.role} onChange={(e) => setRole(p, e.target.value as Role)} aria-label={`Role for ${p.full_name}`}>
                {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
              <label
                className={`toggle ${p.is_admin ? 'toggle-on toggle-admin' : ''} ${p.role === 'pending' || p.role === 'kitchen' ? 'toggle-disabled' : ''}`}
                title={p.role === 'pending' ? 'Give them a role first' : p.role === 'kitchen' ? 'The shared kitchen device can’t be an admin' : 'Admins can open Setup and change the app for everyone'}
              >
                <input
                  type="checkbox"
                  checked={!!p.is_admin}
                  disabled={p.role === 'pending' || p.role === 'kitchen'}
                  onChange={(e) => setAdmin(p, e.target.checked)}
                  aria-label={`Admin: ${p.full_name || 'this person'} can configure the app`}
                />
                <span className="toggle-track" aria-hidden="true"><span /></span>
                <span>Admin</span>
              </label>
            </div>
            <div className="person-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setCoding(p)}>
                <Icon name="key" size={16} /> Sign-in code
              </button>
              {p.id !== me?.id && methods[p.id]?.email && (
                <button className="btn btn-ghost btn-sm" onClick={() => setSettingPassword(p)}>Set password</button>
              )}
              {p.id !== me?.id && (methods[p.id]?.passkeys ?? 0) > 0 && (
                <button className="btn btn-ghost btn-sm text-danger" onClick={() => removePasskeys(p)}>Remove passkeys</button>
              )}
              {p.id !== me?.id && (
                <button className="btn btn-ghost btn-sm text-danger" onClick={() => deleteAccount(p)}>
                  <Icon name="trash" size={16} /> Delete account
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {settingPassword && <SetPasswordModal person={settingPassword} onClose={() => setSettingPassword(null)} />}
      {coding && <SignInCodeModal person={coding} onClose={() => setCoding(null)} />}
    </section>
  );
}

function SignInCodeModal({ person, onClose }: { person: Profile; onClose: () => void }) {
  const { toast } = useApp();
  const [result, setResult] = useState<{ code: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function make() {
    setBusy(true);
    const { data, error } = await accountAction<{ code: string; expires_at: string }>({ action: 'code-create', userId: person.id });
    setBusy(false);
    if (error || !data) return toast(error ?? 'Could not make a code', 'error');
    setResult(data);
  }

  return (
    <Modal title={`Sign-in code for ${person.full_name || 'this person'}`} onClose={onClose}>
      {result ? (
        <>
          <div className="temp-password code-display">
            <code>{result.code}</code>
          </div>
          <ol className="code-steps">
            <li>On the new phone or tablet, open the app.</li>
            <li>Tap <strong>I have a sign-in code</strong> and enter this code.</li>
            <li>Tap <strong>Save passkey</strong> when the app asks.</li>
          </ol>
          <p className="muted small">Works once, until {new Date(result.expires_at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}. Making a new code cancels this one. Give it to them in person.</p>
          <button className="btn btn-primary btn-block" onClick={onClose}>Done</button>
        </>
      ) : (
        <>
          <p className="muted">
            A one-time code lets {person.full_name || 'them'} sign in on a new or replaced device and save a passkey there. For the store tablet, make a code for the Shared Kitchen Device account.
          </p>
          <button className="btn btn-primary btn-block" onClick={make} disabled={busy}>
            <Icon name="key" size={18} /> {busy ? 'Making code…' : 'Make a sign-in code'}
          </button>
        </>
      )}
    </Modal>
  );
}

/** Easy to read aloud or type: no look-alike characters (0/O, 1/l/I). */
function suggestPassword() {
  const words = ['Biscuit', 'Pickle', 'Waffle', 'Nugget', 'Lemon', 'Sunny', 'Maple', 'Honey', 'Pepper', 'Kale'];
  const n = new Uint32Array(2);
  crypto.getRandomValues(n);
  return `${words[n[0] % words.length]}-${2000 + (n[1] % 7999)}`;
}

function SetPasswordModal({ person, onClose }: { person: Profile; onClose: () => void }) {
  const { toast } = useApp();
  const [password, setPassword] = useState(suggestPassword);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function save() {
    if (password.length < 6) return toast('Use at least 6 characters', 'error');
    setSaving(true);
    const { error } = await supabase.functions.invoke('set-password', { body: { userId: person.id, password } });
    setSaving(false);
    if (error) {
      let message = errorMessage(error);
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx) message = (await ctx.json()).error ?? message;
      } catch {
        /* keep the generic message */
      }
      return toast(message, 'error');
    }
    setDone(true);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      toast('Password copied');
    } catch {
      toast('Copy it from the box above', 'error');
    }
  }

  return (
    <Modal title={`Set a password for ${person.full_name || 'this person'}`} onClose={onClose}>
      {done ? (
        <>
          <div className="done-banner"><Icon name="done" size={18} /> Password set. Give it to {person.full_name || 'them'} in person.</div>
          <div className="temp-password">
            <code>{password}</code>
            <button className="btn btn-ghost btn-sm" onClick={copy}>Copy</button>
          </div>
          <p className="muted small">They sign in with their email and this password, then can change it in Account.</p>
          <button className="btn btn-primary btn-block" onClick={onClose}>Done</button>
        </>
      ) : (
        <>
          <p className="muted">Use this when someone forgets their password. Their old password stops working right away.</p>
          <label className="field">
            <span>Temporary password</span>
            <div className="row-gap">
              <input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" spellCheck={false} aria-label="Temporary password" />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPassword(suggestPassword())}>New one</button>
            </div>
          </label>
          <button className="btn btn-primary btn-block" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Set password'}</button>
        </>
      )}
    </Modal>
  );
}
