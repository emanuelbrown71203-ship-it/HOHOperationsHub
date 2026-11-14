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
  type WasteItem,
} from '../lib/types';
import Icon from '../components/Icon';
import { useConfirm } from '../components/Confirm';
import { PhotoPicker, PhotoThumb } from '../components/Photo';
import { usePositions } from '../lib/usePositions';
import { removeFiles, uploadFile } from '../lib/files';

type Tab = 'store' | 'leads' | 'checklists' | 'positions' | 'waste' | 'equipment' | 'team';

export default function Setup() {
  const { isDirector } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'store';
  const tabs: [Tab, string][] = [
    ['store', 'Store'],
    ['leads', 'HOH Leads'],
    ['checklists', 'Lead checklists'],
    ['positions', 'Positions'],
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
      {tab === 'positions' && <PositionsEditor />}
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
    </div>
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
      </ul>
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
        <SectionIntro title="HOH Lead checklists">The few checklists the HOH Lead must complete in the app. Pick one to edit its tasks.</SectionIntro>
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
  const { rows, run, move } = useTable<Equipment>('equipment');
  const confirm = useConfirm();
  const [category, setCategory] = useState('Fryer');
  const categories = [...new Set(['Fryer', 'Cooking', 'Holding', 'Prep', 'Refrigeration', 'Cleaning', 'Other', ...rows.map((r) => r.category)])];
  return (
    <section className="card">
      <SectionIntro title="Equipment">The list people pick from when they leave a kitchen note. Hide anything you no longer have.</SectionIntro>
      <datalist id="equip-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      <AddRow placeholder="Equipment name" onAdd={(name) => run(supabase.from('equipment').insert({ name, category: category.trim() || 'Other', sort_order: nextOrder(rows) }), `Added ${name}`)}>
        <input list="equip-cats" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="cat-input" placeholder="Category" />
      </AddRow>
      <ul className="edit-list">
        {rows.map((eq, i) => (
          <li key={eq.id} className={eq.active ? '' : 'inactive'}>
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
                if (await confirm({ title: `Delete ${eq.name}?`, body: 'This deletes all of its notes too. To keep them, hide it instead.', confirmLabel: 'Delete', danger: true })) {
                  run(supabase.from('equipment').delete().eq('id', eq.id));
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
