import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorMessage } from '../lib/supabase';
import { formatClock } from '../lib/dates';
import {
  ROLE_LABELS,
  type AppSettings,
  type ChecklistItem,
  type ChecklistTemplate,
  type Equipment,
  type HohLead,
  type Profile,
  type Role,
  type ShiftDef,
  type WasteItem,
} from '../lib/types';
import Icon from '../components/Icon';
import { useConfirm } from '../components/Confirm';

type Tab = 'store' | 'leads' | 'checklists' | 'waste' | 'equipment' | 'team';

export default function Setup() {
  const { isDirector } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'store';
  const tabs: [Tab, string][] = [
    ['store', 'Store'],
    ['leads', 'HOH Leads'],
    ['checklists', 'Checklists'],
    ['waste', 'Waste items'],
    ['equipment', 'Equipment'],
    ...(isDirector ? ([['team', 'Team']] as [Tab, string][]) : []),
  ];

  return (
    <div className="page sec-setup">
      <div className="page-title">
        <span className="page-icon"><Icon name="gear" size={22} /></span>
        <h1>Setup</h1>
      </div>
      <p className="muted lede">Everything here changes the app for the whole store right away. No code needed.</p>
      <div className="tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setParams({ tab: k }, { replace: true })}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'store' && <StoreEditor />}
      {tab === 'leads' && <LeadsEditor />}
      {tab === 'checklists' && <ChecklistsEditor />}
      {tab === 'waste' && <WasteItemsEditor />}
      {tab === 'equipment' && <EquipmentEditor />}
      {tab === 'team' && isDirector && <TeamEditor />}
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

      <section className="card">
        <SectionIntro title="Waste reasons">The reason buttons on the Waste Log.</SectionIntro>
        <ListEditor items={settings.waste_reasons} noun="reason" onChange={(waste_reasons) => save({ waste_reasons })} />
      </section>

      <section className="card">
        <SectionIntro title="Waste units">Units people can pick when logging waste.</SectionIntro>
        <ListEditor items={settings.waste_units} noun="unit" onChange={(waste_units) => save({ waste_units })} />
      </section>

      <section className="card">
        <SectionIntro title="Equipment actions">
          The buttons for logging work on equipment, like "Filter change". Reporting an issue is always available.
        </SectionIntro>
        <ListEditor items={settings.equipment_actions} noun="action" onChange={(equipment_actions) => save({ equipment_actions })} />
      </section>
    </div>
  );
}

function ShiftsEditor() {
  const { settings, shift } = useApp();
  const save = useSaveSettings();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const sorted = (list: ShiftDef[]) => [...list].sort((a, b) => a.start.localeCompare(b.start));

  async function update(list: ShiftDef[], ok?: string) {
    await save({ shifts: sorted(list) }, ok);
  }

  return (
    <section className="card">
      <SectionIntro title="Shifts">
        The app switches shifts automatically at each start time. Checklists, waste and equipment entries are tagged with the shift.
      </SectionIntro>
      <ul className="edit-list shift-list">
        {settings.shifts.map((s, i) => (
          <li key={`${s.name}-${i}`}>
            <span className={`shift-chip tone-${['sunrise', 'day', 'dusk', 'night'][Math.min(i, 3)]}`} aria-hidden="true" />
            <InlineText label="Shift name" value={s.name} onSave={(v) => update(settings.shifts.map((x, j) => (j === i ? { ...x, name: v } : x)), 'Shift renamed')} />
            <label className="time-field">
              <span>Starts</span>
              <input
                type="time"
                value={s.start}
                onChange={(e) => e.target.value && update(settings.shifts.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)), `${s.name} now starts at ${formatClock(e.target.value)}`)}
              />
            </label>
            {s.name === shift && <span className="pill pill-accent">Now</span>}
            <button
              className="icon-btn"
              aria-label={`Remove ${s.name}`}
              disabled={settings.shifts.length <= 1}
              onClick={async () => {
                if (await confirm({ title: `Remove the ${s.name} shift?`, body: 'Past entries keep their shift name. Checklists assigned to this shift will show as "Any shift" until you reassign them.', confirmLabel: 'Remove', danger: true })) {
                  update(settings.shifts.filter((_, j) => j !== i), 'Shift removed');
                }
              }}
            >
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !start) return;
          if (settings.shifts.some((s) => s.name.toLowerCase() === name.trim().toLowerCase())) return;
          update([...settings.shifts, { name: name.trim(), start }], `Added ${name.trim()} shift`).then(() => {
            setName('');
            setStart('');
          });
        }}
      >
        <input placeholder="New shift name, e.g. Overnight" value={name} onChange={(e) => setName(e.target.value)} aria-label="New shift name" />
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start time" className="time-input" />
        <button className="btn btn-primary" disabled={!name.trim() || !start}><Icon name="plus" size={18} /> Add</button>
      </form>
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
  const confirm = useConfirm();
  return (
    <section className="card">
      <SectionIntro title="HOH Leads">
        The names the shared kitchen device can pick as Shift Lead. Hide a lead who has left; their name stays on past entries.
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
              <ActiveToggle active={l.active} onChange={(active) => run(supabase.from('hoh_leads').update({ active }).eq('id', l.id))} />
              <button
                className="icon-btn"
                aria-label={`Delete ${l.name}`}
                onClick={async () => {
                  if (await confirm({ title: `Delete ${l.name}?`, body: 'Past entries keep their name. To keep them selectable later, hide them instead.', confirmLabel: 'Delete', danger: true })) {
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
        <SectionIntro title="Checklists">Pick one to edit its tasks. Use the arrows to change the order everyone sees.</SectionIntro>
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

      {current && <TemplateEditor key={current.id} template={current} onChanged={() => run(Promise.resolve({ error: null }))} />}
    </div>
  );
}

function TemplateEditor({ template, onChanged }: { template: ChecklistTemplate; onChanged: () => void }) {
  const { toast, shiftNames } = useApp();
  const confirm = useConfirm();
  const { rows: items, run, move } = useTable<ChecklistItem>('checklist_items', { column: 'template_id', value: template.id });

  async function updateTemplate(patch: Partial<ChecklistTemplate>) {
    const { error } = await supabase.from('checklist_templates').update(patch).eq('id', template.id);
    if (error) return toast(errorMessage(error), 'error');
    toast('Saved');
    onChanged();
  }

  return (
    <section className="card">
      <div className="field-row">
        <label className="field grow">
          <span>Checklist name</span>
          <InlineText className="big-input" label="Checklist name" value={template.name} onSave={(name) => updateTemplate({ name })} />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Shift</span>
          <select value={template.shift} onChange={(e) => updateTemplate({ shift: e.target.value })}>
            {[...new Set([...shiftNames, 'Any', template.shift])].map((s) => (
              <option key={s} value={s}>{s === 'Any' ? 'Any shift' : s}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Repeats</span>
          <select value={template.frequency} onChange={(e) => updateTemplate({ frequency: e.target.value as ChecklistTemplate['frequency'] })}>
            <option value="daily">Every day</option>
            <option value="weekly">Every week (resets Monday)</option>
          </select>
        </label>
      </div>
      <div className="row-between wrap">
        <ActiveToggle active={template.active} onChange={(active) => updateTemplate({ active })} />
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
          <Icon name="trash" size={16} /> Delete checklist
        </button>
      </div>

      <h3>Tasks</h3>
      <AddRow
        placeholder="New task, e.g. Filter fryers"
        onAdd={(label) => run(supabase.from('checklist_items').insert({ template_id: template.id, label, sort_order: nextOrder(items) }))}
      />
      {items.length === 0 ? (
        <p className="empty">No tasks yet.</p>
      ) : (
        <ul className="edit-list">
          {items.map((it, i) => (
            <li key={it.id} className={it.active ? '' : 'inactive'}>
              <Reorder index={i} count={items.length} onMove={move} />
              <InlineText label="Task" value={it.label} onSave={(label) => run(supabase.from('checklist_items').update({ label }).eq('id', it.id))} />
              <ActiveToggle active={it.active} onChange={(active) => run(supabase.from('checklist_items').update({ active }).eq('id', it.id))} />
              <button
                className="icon-btn"
                aria-label="Delete task"
                onClick={async () => {
                  if (await confirm({ title: `Delete "${it.label}"?`, body: 'Its check-off history is removed too. To keep history, hide it instead.', confirmLabel: 'Delete', danger: true })) {
                    run(supabase.from('checklist_items').delete().eq('id', it.id));
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
/* Equipment                                                           */
/* ------------------------------------------------------------------ */
function EquipmentEditor() {
  const { settings } = useApp();
  const { rows, run, move } = useTable<Equipment>('equipment');
  const confirm = useConfirm();
  const [category, setCategory] = useState('Fryer');
  const categories = [...new Set(['Fryer', 'Cooking', 'Holding', 'Prep', 'Refrigeration', 'Cleaning', 'Other', ...rows.map((r) => r.category)])];
  return (
    <section className="card">
      <SectionIntro title="Equipment">
        Give any item a recurring task (for example "Filter change every 12 hours"). The app shows when it's due and flags it when it's late.
      </SectionIntro>
      <datalist id="equip-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      <AddRow placeholder="Equipment name" onAdd={(name) => run(supabase.from('equipment').insert({ name, category: category.trim() || 'Other', sort_order: nextOrder(rows) }), `Added ${name}`)}>
        <input list="equip-cats" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="cat-input" placeholder="Category" />
      </AddRow>
      <ul className="equip-edit-list">
        {rows.map((eq, i) => (
          <li key={eq.id} className={`equip-edit ${eq.active ? '' : 'inactive'}`}>
            <div className="equip-edit-main">
              <Reorder index={i} count={rows.length} onMove={move} />
              <InlineText label="Equipment name" value={eq.name} onSave={(name) => run(supabase.from('equipment').update({ name }).eq('id', eq.id))} />
              <input
                list="equip-cats"
                className="cat-input"
                defaultValue={eq.category}
                aria-label="Category"
                onBlur={(e) => {
                  const c = e.target.value.trim();
                  if (c && c !== eq.category) run(supabase.from('equipment').update({ category: c }).eq('id', eq.id));
                }}
              />
              <ActiveToggle active={eq.active} onChange={(active) => run(supabase.from('equipment').update({ active }).eq('id', eq.id))} />
              <button
                className="icon-btn"
                aria-label={`Delete ${eq.name}`}
                onClick={async () => {
                  if (await confirm({ title: `Delete ${eq.name}?`, body: 'This deletes ALL of its log history too. To keep history, hide it instead.', confirmLabel: 'Delete', danger: true })) {
                    run(supabase.from('equipment').delete().eq('id', eq.id));
                  }
                }}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
            <div className="equip-track">
              <Icon name="clock" size={16} />
              <span>Recurring task</span>
              <select
                aria-label="Recurring task"
                value={eq.track_action ?? ''}
                onChange={(e) =>
                  run(
                    supabase
                      .from('equipment')
                      .update(e.target.value ? { track_action: e.target.value, track_hours: eq.track_hours ?? 24 } : { track_action: null, track_hours: null })
                      .eq('id', eq.id),
                    'Saved',
                  )
                }
              >
                <option value="">None</option>
                {[...new Set([...settings.equipment_actions, ...(eq.track_action ? [eq.track_action] : [])])].map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              {eq.track_action && (
                <label className="hours-field">
                  every
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    defaultValue={eq.track_hours ?? 24}
                    aria-label="Hours between"
                    onBlur={(e) => {
                      const h = Number(e.target.value);
                      if (h > 0 && h !== eq.track_hours) run(supabase.from('equipment').update({ track_hours: h }).eq('id', eq.id), 'Saved');
                    }}
                  />
                  hours
                </label>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Team (directors only)                                               */
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

  return (
    <section className="card">
      <SectionIntro title="Team accounts">
        New sign-ups wait here until you give them a role. Use "Shared Kitchen Device" for the store tablet's login. Set someone to "No access" to remove their access.
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
                </div>
              </div>
            </div>
            <select value={p.role} onChange={(e) => update(p, { role: e.target.value as Role }, `${p.full_name || 'User'} is now ${ROLE_LABELS[e.target.value as Role]}`)} aria-label={`Role for ${p.full_name}`}>
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </section>
  );
}
