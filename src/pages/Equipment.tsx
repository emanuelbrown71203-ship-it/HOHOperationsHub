import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorMessage } from '../lib/supabase';
import { useRealtime } from '../lib/useRealtime';
import { formatDateTime, formatHours, hoursUntil, timeAgo } from '../lib/dates';
import { downloadCsv } from '../lib/csv';
import { logTypeLabel, type Equipment, type EquipmentLog } from '../lib/types';
import RangePicker, { useRange } from '../components/RangePicker';
import Modal from '../components/Modal';
import Icon, { categoryIcon } from '../components/Icon';
import { useConfirm } from '../components/Confirm';

/** Status of an equipment's recurring task (e.g. "Filter change every 12 hrs"). */
export function trackStatus(eq: Equipment, logs: EquipmentLog[]) {
  if (!eq.track_action || !eq.track_hours) return null;
  const action = eq.track_action.toLowerCase();
  const last = logs.find((l) => l.equipment_id === eq.id && logTypeLabel(l.log_type).toLowerCase() === action);
  const left = last ? hoursUntil(last.logged_at, eq.track_hours) : -Infinity;
  return { action: eq.track_action, hours: eq.track_hours, last, left, due: left <= 0, soon: left > 0 && left <= Math.min(2, eq.track_hours / 4) };
}

export function dueText(t: NonNullable<ReturnType<typeof trackStatus>>) {
  if (!t.last) return `${t.action} not logged yet`;
  if (t.due) return `${t.action} overdue by ${formatHours(-t.left)}`;
  return `${t.action} due in ${formatHours(t.left)}`;
}

export default function EquipmentPage() {
  const { today, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [recent, setRecent] = useState<EquipmentLog[]>([]);
  const [openIssues, setOpenIssues] = useState<EquipmentLog[]>([]);
  const [history, setHistory] = useState<EquipmentLog[]>([]);
  const range = useRange(today, '7d');
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<EquipmentLog | null>(null);
  const [editing, setEditing] = useState<EquipmentLog | null>(null);
  const { from, to } = range;

  const selectedId = params.get('log');
  const selected = equipment.find((e) => e.id === selectedId) ?? null;
  const reportIssue = params.get('issue') === '1';

  const load = useCallback(async () => {
    const [eq, rec, open, hist] = await Promise.all([
      supabase.from('equipment').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('equipment_logs').select('*').order('logged_at', { ascending: false }).limit(500),
      supabase.from('equipment_logs').select('*').eq('status', 'open').order('logged_at', { ascending: false }),
      supabase.from('equipment_logs').select('*').gte('log_date', from).lte('log_date', to).order('logged_at', { ascending: false }).limit(1000),
    ]);
    const err = eq.error || rec.error || open.error || hist.error;
    if (err) toast(errorMessage(err), 'error');
    setEquipment((eq.data as Equipment[]) ?? []);
    setRecent((rec.data as EquipmentLog[]) ?? []);
    setOpenIssues((open.data as EquipmentLog[]) ?? []);
    setHistory((hist.data as EquipmentLog[]) ?? []);
    setLoading(false);
  }, [from, to, toast]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['equipment_logs', 'equipment'], load);

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of equipment) m.set(e.id, e.name);
    return (id: string) => m.get(id) ?? 'Removed equipment';
  }, [equipment]);

  const categories = useMemo(() => {
    const groups = new Map<string, Equipment[]>();
    for (const e of equipment) {
      const list = groups.get(e.category) ?? [];
      list.push(e);
      groups.set(e.category, list);
    }
    return [...groups.entries()];
  }, [equipment]);

  function openLog(id: string | null, issue = false) {
    const next = new URLSearchParams(params);
    if (id) next.set('log', id);
    else next.delete('log');
    if (issue) next.set('issue', '1');
    else next.delete('issue');
    setParams(next, { replace: true });
  }

  function exportCsv() {
    downloadCsv(
      `equipment-${from}${from !== to ? `-to-${to}` : ''}.csv`,
      ['Date/Time', 'Shift', 'Equipment', 'Type', 'Notes', 'Logged by', 'Status', 'Resolved by', 'Resolved at', 'Resolution notes'],
      history.map((l) => [
        formatDateTime(l.logged_at),
        l.shift,
        nameOf(l.equipment_id),
        logTypeLabel(l.log_type),
        l.notes,
        l.performed_by_name,
        l.log_type === 'issue' ? l.status : '',
        l.resolved_by_name,
        l.resolved_at ? formatDateTime(l.resolved_at) : '',
        l.resolution_notes,
      ]),
    );
  }

  return (
    <div className="page sec-equipment">
      <div className="page-head">
        <div className="page-title">
          <span className="page-icon"><Icon name="wrench" size={22} /></span>
          <h1>Equipment</h1>
        </div>
        <button className="btn btn-danger" onClick={() => openLog(equipment[0]?.id ?? null, true)} disabled={equipment.length === 0}>
          <Icon name="alert" size={18} /> Report issue
        </button>
      </div>

      {openIssues.length > 0 && (
        <section className="card card-alert">
          <h2>Open issues ({openIssues.length})</h2>
          <ul className="issue-list">
            {openIssues.map((l) => (
              <li key={l.id} className="issue issue-row">
                <div className="entry-main">
                  <strong>{nameOf(l.equipment_id)}</strong>
                  <span>{l.notes}</span>
                  <span className="meta">Reported {timeAgo(l.logged_at)} by {l.performed_by_name}</span>
                </div>
                <button className="btn btn-sm btn-primary" onClick={() => setResolving(l)}>Resolve</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loading ? (
        <div className="spinner" />
      ) : equipment.length === 0 ? (
        <div className="empty">No equipment yet. A lead or director can add it in Setup → Equipment.</div>
      ) : (
        categories.map(([cat, list]) => (
          <section key={cat} className="stack">
            <h2 className="section-title"><Icon name={categoryIcon(cat)} size={16} /> {cat}</h2>
            <div className="equip-grid">
              {list.map((e) => {
                const issues = openIssues.filter((i) => i.equipment_id === e.id).length;
                const t = trackStatus(e, recent);
                const last = recent.find((l) => l.equipment_id === e.id && l.log_type !== 'issue');
                const state = issues ? 'issue' : t?.due ? 'due' : t?.soon ? 'soon' : 'ok';
                return (
                  <button key={e.id} className={`equip-card equip-${state}`} onClick={() => openLog(e.id)}>
                    <div className="equip-top">
                      <span className="equip-icon"><Icon name={categoryIcon(e.category)} size={20} /></span>
                      <span className={`status status-${state}`}>
                        {issues ? `${issues} issue${issues > 1 ? 's' : ''}` : t?.due ? 'Due now' : t?.soon ? 'Due soon' : 'OK'}
                      </span>
                    </div>
                    <strong className="equip-name">{e.name}</strong>
                    <span className="muted small">
                      {t ? dueText(t) : last ? `${logTypeLabel(last.log_type)} ${timeAgo(last.logged_at)}` : 'Nothing logged yet'}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}

      <section className="stack">
        <div className="row-between wrap">
          <h2 className="section-title">History</h2>
          <div className="row-gap wrap">
            <RangePicker range={range} />
            <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={history.length === 0}>
              <Icon name="download" size={16} /> Export CSV
            </button>
          </div>
        </div>
        <div className="card">
          {history.length === 0 ? (
            <p className="muted">Nothing logged in this range.</p>
          ) : (
            <ul className="entries">
              {history.map((l) => (
                <LogRow key={l.id} log={l} equipmentName={nameOf(l.equipment_id)} onEdit={() => setEditing(l)} />
              ))}
            </ul>
          )}
        </div>
      </section>

      {selected && (
        <LogModal
          key={`${selected.id}-${reportIssue}`}
          equipment={equipment}
          initial={selected}
          initialIssue={reportIssue}
          recent={recent}
          onClose={() => openLog(null)}
          onSaved={load}
        />
      )}
      {resolving && <ResolveModal log={resolving} equipmentName={nameOf(resolving.equipment_id)} onClose={() => setResolving(null)} onSaved={load} />}
      {editing && <EditLogModal log={editing} equipmentName={nameOf(editing.equipment_id)} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

function LogRow({ log, equipmentName, onEdit }: { log: EquipmentLog; equipmentName: string; onEdit?: () => void }) {
  const { session, isManager } = useApp();
  const canEdit = onEdit && (log.user_id === session?.user.id || isManager);
  return (
    <li className="entry">
      <div className="entry-main">
        <strong>
          {equipmentName} · {logTypeLabel(log.log_type)}
          {log.log_type === 'issue' && (
            <span className={`pill ${log.status === 'open' ? 'pill-danger' : 'pill-ok'}`}>{log.status === 'open' ? 'Open' : 'Resolved'}</span>
          )}
        </strong>
        {log.notes && <span>{log.notes}</span>}
        <span className="muted small">
          {formatDateTime(log.logged_at)} · {log.shift} · {log.performed_by_name}
        </span>
        {log.status === 'resolved' && (
          <span className="muted small">
            Resolved {log.resolved_at ? formatDateTime(log.resolved_at) : ''} by {log.resolved_by_name}
            {log.resolution_notes ? ` · ${log.resolution_notes}` : ''}
          </span>
        )}
      </div>
      {canEdit && (
        <button className="icon-btn" onClick={onEdit} aria-label="Edit entry">
          <Icon name="edit" size={18} />
        </button>
      )}
    </li>
  );
}

function LogModal({
  equipment,
  initial,
  initialIssue,
  recent,
  onClose,
  onSaved,
}: {
  equipment: Equipment[];
  initial: Equipment;
  initialIssue: boolean;
  recent: EquipmentLog[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { today, shift, ensureActor, actorLeadId, actorName, toast, settings } = useApp();
  const [equipmentId, setEquipmentId] = useState(initial.id);
  const current = equipment.find((e) => e.id === equipmentId) ?? initial;
  const [type, setType] = useState<string | null>(initialIssue ? 'issue' : initial.track_action ?? null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const past = recent.filter((l) => l.equipment_id === equipmentId).slice(0, 8);
  const actions = [...new Set([...settings.equipment_actions, ...(current.track_action ? [current.track_action] : [])])];
  const t = trackStatus(current, recent);

  async function save() {
    if (!type) return toast('Choose what was done', 'error');
    if (type === 'issue' && !notes.trim()) return toast('Describe the issue', 'error');
    if (!ensureActor()) return;
    setSaving(true);
    const { error } = await supabase.from('equipment_logs').insert({
      equipment_id: equipmentId,
      log_type: type,
      notes: notes.trim() || null,
      shift,
      log_date: today,
      lead_id: actorLeadId,
    });
    setSaving(false);
    if (error) return toast(errorMessage(error), 'error');
    toast(`${logTypeLabel(type)} logged for ${current.name}`);
    onSaved();
    onClose();
  }

  return (
    <Modal title={type === 'issue' ? 'Report an issue' : current.name} onClose={onClose}>
      <label className="field">
        <span>Equipment</span>
        <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
          {equipment.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </label>

      {t && (
        <div className={`track-note ${t.due ? 'track-due' : ''}`}>
          <Icon name="clock" size={18} />
          <span><strong>{t.action}</strong> every {t.hours} hrs · {dueText(t)}</span>
        </div>
      )}

      <div className="field">
        <span>What was done?</span>
        <div className="chips">
          {actions.map((a) => (
            <button type="button" key={a} className={`chip ${type === a ? 'on' : ''}`} onClick={() => setType(a)}>
              {a}
            </button>
          ))}
          <button type="button" className={`chip chip-danger ${type === 'issue' ? 'on' : ''}`} onClick={() => setType('issue')}>
            Report issue
          </button>
        </div>
      </div>

      <label className="field">
        <span>{type === 'issue' ? "What's wrong?" : 'Notes (optional)'}</span>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={type === 'issue' ? 'e.g. Not holding temperature, error code E4' : ''} />
      </label>

      <button className={`btn btn-block ${type === 'issue' ? 'btn-danger btn-solid' : 'btn-primary'}`} onClick={save} disabled={saving}>
        {saving ? 'Saving…' : type === 'issue' ? 'Report issue' : 'Save'}
      </button>
      <p className="muted small center">
        {shift} shift · {actorName ? `Logged as ${actorName}` : 'Choose the Shift Lead first'}
      </p>

      {past.length > 0 && (
        <>
          <h3>Recent for {current.name}</h3>
          <ul className="entries compact">
            {past.map((l) => (
              <LogRow key={l.id} log={l} equipmentName={current.name} />
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

function EditLogModal({ log, equipmentName, onClose, onSaved }: { log: EquipmentLog; equipmentName: string; onClose: () => void; onSaved: () => void }) {
  const { toast, settings } = useApp();
  const confirm = useConfirm();
  const [type, setType] = useState(log.log_type);
  const [notes, setNotes] = useState(log.notes ?? '');
  const [saving, setSaving] = useState(false);
  const actions = [...new Set([...settings.equipment_actions, logTypeLabel(log.log_type)])];

  async function save() {
    setSaving(true);
    const patch: Partial<EquipmentLog> = { notes: notes.trim() || null };
    if (log.log_type !== 'issue') patch.log_type = type;
    const { error } = await supabase.from('equipment_logs').update(patch).eq('id', log.id);
    setSaving(false);
    if (error) return toast(errorMessage(error), 'error');
    toast('Entry updated');
    onSaved();
    onClose();
  }

  async function remove() {
    if (!(await confirm({ title: 'Delete this entry?', body: `${equipmentName} · ${logTypeLabel(log.log_type)}, logged by ${log.performed_by_name}.`, confirmLabel: 'Delete', danger: true }))) return;
    const { error } = await supabase.from('equipment_logs').delete().eq('id', log.id);
    if (error) return toast(errorMessage(error), 'error');
    toast('Entry deleted');
    onSaved();
    onClose();
  }

  return (
    <Modal title={`Edit: ${equipmentName}`} onClose={onClose}>
      {log.log_type !== 'issue' && (
        <label className="field">
          <span>What was done</span>
          <select value={logTypeLabel(type)} onChange={(e) => setType(e.target.value)}>
            {actions.map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
      )}
      <label className="field">
        <span>Notes</span>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <p className="muted small">Logged {formatDateTime(log.logged_at)} by {log.performed_by_name}. The name on an entry can't be changed.</p>
      <div className="confirm-actions">
        <button className="btn btn-ghost text-danger" onClick={remove}><Icon name="trash" size={16} /> Delete</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
    </Modal>
  );
}

function ResolveModal({ log, equipmentName, onClose, onSaved }: { log: EquipmentLog; equipmentName: string; onClose: () => void; onSaved: () => void }) {
  const { ensureActor, actorLeadId, actorName, toast } = useApp();
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!ensureActor()) return;
    setSaving(true);
    const { error } = await supabase.rpc('resolve_equipment_issue', {
      p_log_id: log.id,
      p_lead_id: actorLeadId,
      p_notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) return toast(errorMessage(error), 'error');
    toast(`Issue resolved for ${equipmentName}`);
    onSaved();
    onClose();
  }

  return (
    <Modal title={`Resolve: ${equipmentName}`} onClose={onClose}>
      <div className="issue">
        <strong>Issue</strong>
        <span>{log.notes}</span>
        <span className="meta">Reported {formatDateTime(log.logged_at)} by {log.performed_by_name}</span>
      </div>
      <label className="field" style={{ marginTop: 16 }}>
        <span>How was it fixed? (optional)</span>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Tech replaced thermostat" />
      </label>
      <button className="btn btn-primary btn-block" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Mark resolved'}
      </button>
      <p className="muted small center">{actorName ? `Resolved by ${actorName}` : 'Choose the Shift Lead first'}</p>
    </Modal>
  );
}
