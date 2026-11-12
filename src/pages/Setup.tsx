import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorMessage } from '../lib/supabase';
import {
  ROLE_LABELS,
  SHIFTS,
  WASTE_UNITS,
  type ChecklistItem,
  type ChecklistTemplate,
  type Equipment,
  type HohLead,
  type Profile,
  type Role,
  type WasteItem,
} from '../lib/types';
import Icon from '../components/Icon';

type Tab = 'leads' | 'checklists' | 'waste' | 'equipment' | 'team';

export default function Setup() {
  const { isDirector } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'leads';
  const tabs: [Tab, string][] = [
    ['leads', 'HOH Leads'],
    ['checklists', 'Checklists'],
    ['waste', 'Waste items'],
    ['equipment', 'Equipment'],
    ...(isDirector ? ([['team', 'Team']] as [Tab, string][]) : []),
  ];

  return (
    <div className="page">
      <h1>Setup</h1>
      <div className="tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setParams({ tab: k }, { replace: true })}>
            {label}
          </button>
        ))}
      </div>
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

  return { rows, loading, load, run };
}

function nextOrder(rows: { sort_order: number }[]) {
  return rows.reduce((m, r) => Math.max(m, r.sort_order), 0) + 1;
}

function InlineText({ value, onSave, label }: { value: string; onSave: (v: string) => void; label: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className="inline-input"
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
    <label className="toggle" title={active ? 'Shown in the app' : 'Hidden'}>
      <input type="checkbox" checked={active} onChange={(e) => onChange(e.target.checked)} />
      <span>{active ? 'Active' : 'Hidden'}</span>
    </label>
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

/* ------------------------------------------------------------------ */
/* HOH Leads                                                           */
/* ------------------------------------------------------------------ */
function LeadsEditor() {
  const { rows, run } = useTable<HohLead>('hoh_leads');
  return (
    <section className="card">
      <h2>HOH Leads</h2>
      <p className="muted small">
        These are the names the shared kitchen device can pick as <strong>Shift Lead</strong>. Hide a lead who has left; their name stays on past entries.
      </p>
      <AddRow placeholder="Lead's name" onAdd={(name) => run(supabase.from('hoh_leads').insert({ name, sort_order: nextOrder(rows) }), `Added ${name}`)} />
      {rows.length === 0 ? (
        <p className="empty">No leads yet. Add your HOH Leads above.</p>
      ) : (
        <ul className="edit-list">
          {rows.map((l) => (
            <li key={l.id} className={l.active ? '' : 'inactive'}>
              <InlineText label="Lead name" value={l.name} onSave={(name) => run(supabase.from('hoh_leads').update({ name }).eq('id', l.id))} />
              <ActiveToggle active={l.active} onChange={(active) => run(supabase.from('hoh_leads').update({ active }).eq('id', l.id))} />
              <button
                className="icon-btn"
                aria-label={`Delete ${l.name}`}
                onClick={() => confirm(`Delete ${l.name}? Past entries keep their name.`) && run(supabase.from('hoh_leads').delete().eq('id', l.id), 'Deleted')}
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
  const { rows: templates, run } = useTable<ChecklistTemplate>('checklist_templates');
  const [selected, setSelected] = useState<string | null>(null);
  const current = templates.find((t) => t.id === selected) ?? templates[0] ?? null;

  return (
    <div className="two-col setup-cols">
      <section className="card">
        <h2>Checklists</h2>
        <AddRow
          placeholder="New checklist name"
          onAdd={async (name) => {
            const { data, error } = await supabase
              .from('checklist_templates')
              .insert({ name, shift: 'Any', sort_order: nextOrder(templates) })
              .select()
              .single();
            const ok = await run(Promise.resolve({ error }), `Created ${name}`);
            if (ok && data) setSelected((data as ChecklistTemplate).id);
            return ok;
          }}
        />
        <ul className="pick-list">
          {templates.map((t) => (
            <li key={t.id}>
              <button className={`pick ${current?.id === t.id ? 'on' : ''} ${t.active ? '' : 'inactive'}`} onClick={() => setSelected(t.id)}>
                <span>{t.name}</span>
                <span className="muted small">{t.shift === 'Any' ? 'Any shift' : t.shift}{t.active ? '' : ' · hidden'}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {current && <TemplateEditor key={current.id} template={current} onChanged={() => run(Promise.resolve({ error: null }))} />}
    </div>
  );
}

function TemplateEditor({ template, onChanged }: { template: ChecklistTemplate; onChanged: () => void }) {
  const { toast } = useApp();
  const { rows: items, run } = useTable<ChecklistItem>('checklist_items', { column: 'template_id', value: template.id });

  async function updateTemplate(patch: Partial<ChecklistTemplate>) {
    const { error } = await supabase.from('checklist_templates').update(patch).eq('id', template.id);
    if (error) return toast(errorMessage(error), 'error');
    onChanged();
  }

  async function move(index: number, dir: -1 | 1) {
    const a = items[index];
    const b = items[index + dir];
    if (!a || !b) return;
    // Renumber the whole list so ties never get stuck.
    const reordered = [...items];
    reordered[index] = b;
    reordered[index + dir] = a;
    const results = await Promise.all(
      reordered.map((it, i) => supabase.from('checklist_items').update({ sort_order: i + 1 }).eq('id', it.id)),
    );
    await run(Promise.resolve({ error: results.find((r) => r.error)?.error ?? null }));
  }

  return (
    <section className="card">
      <div className="field-row">
        <label className="field grow">
          <span>Checklist name</span>
          <InlineText label="Checklist name" value={template.name} onSave={(name) => updateTemplate({ name })} />
        </label>
        <label className="field">
          <span>Shift</span>
          <select value={template.shift} onChange={(e) => updateTemplate({ shift: e.target.value })}>
            {[...SHIFTS, 'Any'].map((s) => (
              <option key={s} value={s}>{s === 'Any' ? 'Any shift' : s}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="row-between">
        <ActiveToggle active={template.active} onChange={(active) => updateTemplate({ active })} />
        <button
          className="btn btn-ghost btn-sm text-danger"
          onClick={async () => {
            if (!confirm(`Delete the "${template.name}" checklist and all of its check-off history? To keep history, hide it instead.`)) return;
            const { error } = await supabase.from('checklist_templates').delete().eq('id', template.id);
            if (error) return toast(errorMessage(error), 'error');
            toast('Checklist deleted');
            onChanged();
          }}
        >
          <Icon name="trash" size={16} /> Delete checklist
        </button>
      </div>

      <h3>Items</h3>
      <AddRow
        placeholder="New item, e.g. Filter fryers"
        onAdd={(label) => run(supabase.from('checklist_items').insert({ template_id: template.id, label, sort_order: nextOrder(items) }))}
      />
      {items.length === 0 ? (
        <p className="empty">No items yet.</p>
      ) : (
        <ul className="edit-list">
          {items.map((it, i) => (
            <li key={it.id} className={it.active ? '' : 'inactive'}>
              <div className="reorder">
                <button className="icon-btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><Icon name="up" size={16} /></button>
                <button className="icon-btn sm" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down"><Icon name="down" size={16} /></button>
              </div>
              <InlineText label="Item" value={it.label} onSave={(label) => run(supabase.from('checklist_items').update({ label }).eq('id', it.id))} />
              <ActiveToggle active={it.active} onChange={(active) => run(supabase.from('checklist_items').update({ active }).eq('id', it.id))} />
              <button
                className="icon-btn"
                aria-label="Delete item"
                onClick={() => confirm(`Delete "${it.label}"? Its check-off history is removed too. To keep history, hide it instead.`) && run(supabase.from('checklist_items').delete().eq('id', it.id))}
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
  const { rows, run } = useTable<WasteItem>('waste_items');
  const [unit, setUnit] = useState('each');
  return (
    <section className="card">
      <h2>Waste items</h2>
      <p className="muted small">Quick-pick buttons on the Waste Log. Team members can still type any other item.</p>
      <AddRow placeholder="Item name" onAdd={(name) => run(supabase.from('waste_items').insert({ name, default_unit: unit, sort_order: nextOrder(rows) }), `Added ${name}`)}>
        <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Default unit">
          {WASTE_UNITS.map((u) => <option key={u}>{u}</option>)}
        </select>
      </AddRow>
      <ul className="edit-list">
        {rows.map((w) => (
          <li key={w.id} className={w.active ? '' : 'inactive'}>
            <InlineText label="Item name" value={w.name} onSave={(name) => run(supabase.from('waste_items').update({ name }).eq('id', w.id))} />
            <select value={w.default_unit} onChange={(e) => run(supabase.from('waste_items').update({ default_unit: e.target.value }).eq('id', w.id))} aria-label="Default unit">
              {[...new Set([...WASTE_UNITS, w.default_unit])].map((u) => <option key={u}>{u}</option>)}
            </select>
            <ActiveToggle active={w.active} onChange={(active) => run(supabase.from('waste_items').update({ active }).eq('id', w.id))} />
            <button className="icon-btn" aria-label={`Delete ${w.name}`} onClick={() => confirm(`Delete ${w.name}? Past waste entries are kept.`) && run(supabase.from('waste_items').delete().eq('id', w.id))}>
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
  const { rows, run } = useTable<Equipment>('equipment');
  const [category, setCategory] = useState('Fryer');
  const categories = [...new Set(['Fryer', 'Cooking', 'Holding', 'Prep', 'Refrigeration', 'Cleaning', 'Other', ...rows.map((r) => r.category)])];
  return (
    <section className="card">
      <h2>Equipment</h2>
      <p className="muted small">
        Equipment in the <strong>Fryer</strong> category shows its last filter change on the Home screen.
      </p>
      <datalist id="equip-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      <AddRow placeholder="Equipment name" onAdd={(name) => run(supabase.from('equipment').insert({ name, category: category.trim() || 'Other', sort_order: nextOrder(rows) }), `Added ${name}`)}>
        <input list="equip-cats" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="cat-input" />
      </AddRow>
      <ul className="edit-list">
        {rows.map((eq) => (
          <li key={eq.id} className={eq.active ? '' : 'inactive'}>
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
              onClick={() => confirm(`Delete ${eq.name} and ALL of its log history? To keep history, hide it instead.`) && run(supabase.from('equipment').delete().eq('id', eq.id))}
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

  async function setRole(p: Profile, role: Role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', p.id);
    if (error) return toast(errorMessage(error), 'error');
    toast(`${p.full_name || 'User'} is now ${ROLE_LABELS[role]}`);
    if (p.id === me?.id) refreshProfile();
    load();
  }

  const pending = people.filter((p) => p.role === 'pending').length;

  return (
    <section className="card">
      <h2>Team accounts {pending > 0 && <span className="pill pill-danger">{pending} waiting</span>}</h2>
      <p className="muted small">
        Approve new sign-ups by giving them a role. Use <strong>Shared Kitchen Device</strong> for the store tablet's login; it credits entries to the chosen Shift Lead.
        Set someone back to <em>Pending</em> to remove their access.
      </p>
      <ul className="edit-list">
        {people.map((p) => (
          <li key={p.id} className={p.role === 'pending' ? 'highlight' : ''}>
            <div className="grow">
              <strong>{p.full_name || '(no name)'}</strong>
              {p.id === me?.id && <span className="pill">You</span>}
              <div className="muted small">Joined {new Date(p.created_at).toLocaleDateString()}</div>
            </div>
            <select value={p.role} onChange={(e) => setRole(p, e.target.value as Role)} aria-label={`Role for ${p.full_name}`}>
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
