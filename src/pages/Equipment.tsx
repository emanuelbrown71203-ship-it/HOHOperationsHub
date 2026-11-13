import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorMessage } from '../lib/supabase';
import { useRealtime } from '../lib/useRealtime';
import { formatDateTime, timeAgo } from '../lib/dates';
import { downloadCsv } from '../lib/csv';
import { EQUIPMENT_LOG_LABELS, type Equipment, type EquipmentLog, type EquipmentLogType } from '../lib/types';
import RangePicker, { rangeDates, type RangeKey } from '../components/RangePicker';
import Modal from '../components/Modal';
import Icon, { categoryIcon } from '../components/Icon';

const LOG_TYPES: EquipmentLogType[] = ['filter_change', 'oil_change', 'cleaning', 'maintenance', 'issue'];

export default function EquipmentPage() {
  const { today, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [recent, setRecent] = useState<EquipmentLog[]>([]);
  const [openIssues, setOpenIssues] = useState<EquipmentLog[]>([]);
  const [history, setHistory] = useState<EquipmentLog[]>([]);
  const [range, setRange] = useState<RangeKey>('7d');
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<EquipmentLog | null>(null);
  const { from, to } = rangeDates(range, today);

  const selectedId = params.get('log');
  const selected = equipment.find((e) => e.id === selectedId) ?? null;
  const reportIssue = params.get('issue') === '1';

  const load = useCallback(async () => {
    const [eq, rec, open, hist] = await Promise.all([
      supabase.from('equipment').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('equipment_logs').select('*').order('logged_at', { ascending: false }).limit(500),
      supabase.from('equipment_logs').select('*').eq('status', 'open').order('logged_at', { ascending: false }),
      supabase
        .from('equipment_logs')
        .select('*')
        .gte('log_date', from)
        .lte('log_date', to)
        .order('logged_at', { ascending: false })
        .limit(1000),
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

  function lastOf(eqId: string, type?: EquipmentLogType) {
    return recent.find((l) => l.equipment_id === eqId && (!type || l.log_type === type) && l.log_type !== 'issue');
  }

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
        EQUIPMENT_LOG_LABELS[l.log_type],
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
    <div className="page">
      <div className="page-head">
        <h1>Equipment</h1>
        <button className="btn btn-danger" onClick={() => openLog(equipment[0]?.id ?? null, true)} disabled={equipment.length === 0}>
          <Icon name="alert" size={18} /> Report issue
        </button>
      </div>

      {openIssues.length > 0 && (
        <section className="card card-alert">
          <h2>Open issues ({openIssues.length})</h2>
          <ul className="entries">
            {openIssues.map((l) => (
              <li key={l.id} className="entry">
                <div className="entry-main">
                  <strong>{nameOf(l.equipment_id)}</strong>
                  <span>{l.notes}</span>
                  <span className="muted small">
                    Reported {timeAgo(l.logged_at)} by {l.performed_by_name}
                  </span>
                </div>
                <button className="btn btn-sm btn-primary" onClick={() => setResolving(l)}>
                  Resolve
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loading ? (
        <div className="spinner" />
      ) : equipment.length === 0 ? (
        <div className="empty">No equipment yet. A lead or director can add it in Setup.</div>
      ) : (
        categories.map(([cat, list]) => (
          <section key={cat} className="stack">
            <h2 className="section-title"><Icon name={categoryIcon(cat)} size={16} /> {cat}</h2>
            <div className="equip-grid">
              {list.map((e) => {
                const issues = openIssues.filter((i) => i.equipment_id === e.id).length;
                const last = cat === 'Fryer' ? lastOf(e.id, 'filter_change') : lastOf(e.id);
                const due = cat === 'Fryer' && (!last || Date.now() - new Date(last.logged_at).getTime() > 12 * 3600 * 1000);
                const state = issues ? 'issue' : due ? 'due' : 'ok';
                return (
                  <button key={e.id} className={`equip-card equip-${state}`} onClick={() => openLog(e.id)}>
                    <div className="equip-top">
                      <span className="equip-icon"><Icon name={categoryIcon(e.category)} size={20} /></span>
                      <span className={`status status-${state}`}>
                        {issues ? `${issues} issue${issues > 1 ? 's' : ''}` : due ? 'Filter due' : 'OK'}
                      </span>
                    </div>
                    <strong className="equip-name">{e.name}</strong>
                    <span className="muted small">
                      {last
                        ? `${cat === 'Fryer' ? 'Filtered' : EQUIPMENT_LOG_LABELS[last.log_type]} ${timeAgo(last.logged_at)}`
                        : cat === 'Fryer'
                          ? 'No filter change logged'
                          : 'Nothing logged yet'}
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
            <RangePicker value={range} onChange={setRange} />
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
                <LogRow key={l.id} log={l} equipmentName={nameOf(l.equipment_id)} />
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
          initialType={reportIssue ? 'issue' : null}
          recent={recent}
          onClose={() => openLog(null)}
          onSaved={load}
        />
      )}
      {resolving && (
        <ResolveModal log={resolving} equipmentName={nameOf(resolving.equipment_id)} onClose={() => setResolving(null)} onSaved={load} />
      )}
    </div>
  );
}

function LogRow({ log, equipmentName }: { log: EquipmentLog; equipmentName: string }) {
  return (
    <li className="entry">
      <div className="entry-main">
        <strong>
          {equipmentName} · {EQUIPMENT_LOG_LABELS[log.log_type]}
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
            {log.resolution_notes ? ` — ${log.resolution_notes}` : ''}
          </span>
        )}
      </div>
    </li>
  );
}

function LogModal({
  equipment,
  initial,
  initialType,
  recent,
  onClose,
  onSaved,
}: {
  equipment: Equipment[];
  initial: Equipment;
  initialType: EquipmentLogType | null;
  recent: EquipmentLog[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { today, shift, ensureActor, actorLeadId, actorName, toast } = useApp();
  const [equipmentId, setEquipmentId] = useState(initial.id);
  const [type, setType] = useState<EquipmentLogType | null>(initialType ?? (initial.category === 'Fryer' ? 'filter_change' : null));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const current = equipment.find((e) => e.id === equipmentId) ?? initial;
  const past = recent.filter((l) => l.equipment_id === equipmentId).slice(0, 8);

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
    toast(`${EQUIPMENT_LOG_LABELS[type]} logged for ${current.name}`);
    onSaved();
    onClose();
  }

  return (
    <Modal title={type === 'issue' ? 'Report an issue' : `Log: ${current.name}`} onClose={onClose}>
      <label className="field">
        <span>Equipment</span>
        <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
          {equipment.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </label>

      <div className="field">
        <span>What was done?</span>
        <div className="chips">
          {LOG_TYPES.map((t) => (
            <button type="button" key={t} className={`chip ${type === t ? 'on' : ''} ${t === 'issue' ? 'chip-danger' : ''}`} onClick={() => setType(t)}>
              {t === 'issue' ? 'Report issue' : EQUIPMENT_LOG_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>{type === 'issue' ? "What's wrong?" : 'Notes (optional)'}</span>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={type === 'issue' ? 'e.g. Not holding temperature, error code E4' : ''} />
      </label>

      <button className={`btn btn-block ${type === 'issue' ? 'btn-danger' : 'btn-primary'}`} onClick={save} disabled={saving}>
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
      <p><strong>Issue:</strong> {log.notes}</p>
      <p className="muted small">Reported {formatDateTime(log.logged_at)} by {log.performed_by_name}</p>
      <label className="field">
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
