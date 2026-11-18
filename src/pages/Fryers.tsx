import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorMessage } from '../lib/supabase';
import { useRealtime } from '../lib/useRealtime';
import { addDays, formatDateTime, timeAgo } from '../lib/dates';
import type { Equipment, EquipmentLog } from '../lib/types';
import Icon from '../components/Icon';
import { useConfirm } from '../components/Confirm';

export type FryerJob = 'filter_change' | 'oil_change';
export const JOB_LABEL: Record<FryerJob, string> = { filter_change: 'Filtered', oil_change: 'Oil changed' };
export const isFryer = (e: Equipment) => /fry/i.test(e.category) || /fryer/i.test(e.name);

export interface JobStatus {
  last: EquipmentLog | null;
  /** Hours until it is due (negative = overdue); null if never logged. */
  hoursLeft: number | null;
  state: 'never' | 'ok' | 'soon' | 'overdue';
}

function statusOf(last: EquipmentLog | null, everyHours: number): JobStatus {
  if (!last) return { last, hoursLeft: null, state: 'never' };
  const hoursLeft = everyHours - (Date.now() - new Date(last.logged_at).getTime()) / 3600000;
  return { last, hoursLeft, state: hoursLeft < 0 ? 'overdue' : hoursLeft < everyHours * 0.2 ? 'soon' : 'ok' };
}

function span(hours: number) {
  const h = Math.abs(hours);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 36) return `${Math.round(h)} hr${Math.round(h) === 1 ? '' : 's'}`;
  return `${Math.round(h / 24)} days`;
}
export function statusWords(s: JobStatus) {
  if (s.state === 'never') return 'Not logged yet';
  if (s.state === 'overdue') return `Overdue by ${span(s.hoursLeft!)}`;
  return `Due in ${span(s.hoursLeft!)}`;
}

/** Fryers with their filter and oil-change history, kept live. */
export function useFryers(today: string) {
  const { settings } = useApp();
  const [fryers, setFryers] = useState<Equipment[]>([]);
  const [logs, setLogs] = useState<EquipmentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const [eq, lg] = await Promise.all([
      supabase.from('equipment').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('equipment_logs').select('*').in('log_type', ['filter_change', 'oil_change']).gte('log_date', addDays(today, -90)).order('logged_at', { ascending: false }).limit(1000),
    ]);
    setFryers(((eq.data as Equipment[]) ?? []).filter(isFryer));
    setLogs((lg.data as EquipmentLog[]) ?? []);
    setLoading(false);
  }, [today]);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['equipment_logs', 'equipment'], load);

  const status = useCallback(
    (fryerId: string, job: FryerJob) =>
      statusOf(logs.find((l) => l.equipment_id === fryerId && l.log_type === job) ?? null, job === 'filter_change' ? settings.fryer_filter_hours : settings.fryer_oil_days * 24),
    [logs, settings.fryer_filter_hours, settings.fryer_oil_days],
  );
  const due = fryers.flatMap((f) => (['filter_change', 'oil_change'] as FryerJob[]).filter((j) => ['overdue', 'never'].includes(status(f.id, j).state)).map((j) => ({ fryer: f, job: j })));
  return { fryers, logs, loading, status, due, reload: load };
}

export default function Fryers() {
  const { today, shift, ensureActor, actorLeadId, toast, settings, isAdmin, isManager, session } = useApp();
  const { fryers, logs, loading, status, reload } = useFryers(today);
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const nameOf = (id: string) => fryers.find((f) => f.id === id)?.name ?? 'Removed fryer';

  async function log(fryer: Equipment, job: FryerJob) {
    if (!ensureActor()) return;
    setBusy(`${fryer.id}|${job}`);
    const { error } = await supabase.from('equipment_logs').insert({ equipment_id: fryer.id, log_type: job, log_date: today, shift, lead_id: actorLeadId });
    setBusy(null);
    if (error) return toast(errorMessage(error), 'error');
    toast(`${fryer.name}: ${JOB_LABEL[job].toLowerCase()}`);
    reload();
  }

  async function undo(l: EquipmentLog) {
    if (!(await confirm({ title: 'Remove this entry?', body: `${nameOf(l.equipment_id)} · ${JOB_LABEL[l.log_type as FryerJob]} by ${l.performed_by_name}, ${formatDateTime(l.logged_at)}`, confirmLabel: 'Remove', danger: true }))) return;
    const { error } = await supabase.from('equipment_logs').delete().eq('id', l.id);
    if (error) return toast(errorMessage(error), 'error');
    reload();
  }

  const history = logs.filter((l) => fryers.some((f) => f.id === l.equipment_id)).slice(0, 25);

  return (
    <div className="page sec-fryers">
      <div className="page-title">
        <span className="page-icon"><Icon name="flame" size={22} /></span>
        <h1>Fryer Tracker</h1>
      </div>
      <p className="muted lede">
        Tap a button when a fryer is filtered or its oil is changed. Filter every {settings.fryer_filter_hours} hours, change oil every {settings.fryer_oil_days} days.
        {isAdmin && <> <Link to="/setup?tab=equipment">Change these in Setup → Kitchen.</Link></>}
      </p>

      {loading ? (
        <div className="spinner" />
      ) : fryers.length === 0 ? (
        <div className="empty">No fryers yet. {isAdmin ? <Link to="/setup?tab=equipment">Add equipment in the “Fryer” category in Setup.</Link> : 'An admin can add them in Setup → Kitchen.'}</div>
      ) : (
        <>
          <div className="fryer-grid">
            {fryers.map((f) => (
              <section key={f.id} className="card fryer-card">
                <h2><Icon name="flame" size={18} /> {f.name}</h2>
                {(['filter_change', 'oil_change'] as FryerJob[]).map((job) => {
                  const s = status(f.id, job);
                  return (
                    <div key={job} className={`fryer-job state-${s.state}`}>
                      <div className="fryer-job-text">
                        <span className="eyebrow">{job === 'filter_change' ? 'Filter' : 'Oil change'}</span>
                        <strong><Icon name={s.state === 'ok' ? 'done' : s.state === 'soon' ? 'clock' : 'alert'} size={16} /> {statusWords(s)}</strong>
                        <small className="muted">{s.last ? `Last: ${timeAgo(s.last.logged_at)} by ${s.last.performed_by_name}` : 'No entry in the last 90 days'}</small>
                      </div>
                      <button className="btn btn-primary btn-sm" onClick={() => log(f, job)} disabled={busy === `${f.id}|${job}`}>
                        <Icon name="done" size={16} /> {JOB_LABEL[job]}
                      </button>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>

          <section className="card">
            <div className="card-head"><h2><span className="dot" />Recent entries</h2></div>
            {history.length === 0 ? (
              <p className="muted">Nothing logged yet.</p>
            ) : (
              <ul className="log-list">
                {history.map((l) => (
                  <li key={l.id}>
                    <span className={`log-kind kind-${l.log_type}`}>{l.log_type === 'filter_change' ? 'Filter' : 'Oil'}</span>
                    <span className="grow"><strong>{nameOf(l.equipment_id)}</strong> <span className="muted small">· {l.performed_by_name} · {l.shift} shift</span></span>
                    <span className="muted small">{formatDateTime(l.logged_at)}</span>
                    {(l.user_id === session?.user.id || isManager) && (
                      <button className="icon-btn sm" onClick={() => undo(l)} aria-label="Remove entry"><Icon name="trash" size={16} /></button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
