import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { useRealtime } from '../lib/useRealtime';
import { useChecklists } from '../lib/useChecklists';
import { formatClock, formatDay, timeAgo } from '../lib/dates';
import { shiftTone } from '../lib/tone';
import type { Equipment, EquipmentLog, WasteEntry } from '../lib/types';
import Progress from '../components/Progress';
import Ring from '../components/Ring';
import DayDot from '../components/DayDot';
import Icon, { categoryIcon } from '../components/Icon';
import { dueText, trackStatus } from './Equipment';

export default function Home() {
  const { today, shift, shiftNames, settings, actorName, isKitchen } = useApp();
  const { progress } = useChecklists(today);
  const [waste, setWaste] = useState<WasteEntry[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [logs, setLogs] = useState<EquipmentLog[]>([]);
  const [issues, setIssues] = useState<EquipmentLog[]>([]);

  const load = useCallback(async () => {
    const [w, eq, lg, op] = await Promise.all([
      supabase.from('waste_entries').select('*').eq('log_date', today),
      supabase.from('equipment').select('*').eq('active', true).order('sort_order'),
      supabase.from('equipment_logs').select('*').order('logged_at', { ascending: false }).limit(300),
      supabase.from('equipment_logs').select('*').eq('status', 'open').order('logged_at', { ascending: false }),
    ]);
    setWaste((w.data as WasteEntry[]) ?? []);
    setEquipment((eq.data as Equipment[]) ?? []);
    setLogs((lg.data as EquipmentLog[]) ?? []);
    setIssues((op.data as EquipmentLog[]) ?? []);
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['waste_entries', 'equipment_logs', 'equipment'], load);

  const tone = shiftTone(shiftNames, shift);
  const shiftDef = settings.shifts.find((s) => s.name === shift);

  const sortedProgress = useMemo(
    () => [...progress].sort((a, b) => Number(b.template.shift === shift) - Number(a.template.shift === shift)),
    [progress, shift],
  );
  const current = sortedProgress.filter((p) => p.template.shift === shift);
  const focus = current.length ? current : sortedProgress;
  const focusDone = focus.reduce((n, p) => n + p.done, 0);
  const focusTotal = focus.reduce((n, p) => n + p.total, 0);
  const allDone = progress.reduce((n, p) => n + p.done, 0);
  const allTotal = progress.reduce((n, p) => n + p.total, 0);

  const topWaste = useMemo(() => {
    const m = new Map<string, { item: string; unit: string; qty: number }>();
    for (const e of waste) {
      const k = `${e.item_name}|${e.unit}`;
      const cur = m.get(k) ?? { item: e.item_name, unit: e.unit, qty: 0 };
      cur.qty += Number(e.quantity);
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [waste]);
  const maxWaste = topWaste[0]?.qty ?? 1;

  const tracked = equipment
    .map((e) => ({ eq: e, t: trackStatus(e, logs) }))
    .filter((x): x is { eq: Equipment; t: NonNullable<ReturnType<typeof trackStatus>> } => !!x.t)
    .sort((a, b) => a.t.left - b.t.left);
  const dueCount = tracked.filter((x) => x.t.due).length;
  const nameOf = (id: string) => equipment.find((e) => e.id === id)?.name ?? 'Equipment';

  return (
    <div className="page sec-home">
      <section className={`hero tone-${tone}`}>
        <div className="hero-sky" aria-hidden="true">
          <span className="hero-sun" />
        </div>
        <div className="hero-main">
          <div className="hero-eyebrow">
            <span>{formatDay(today)}</span>
            <DayDot date={today} />
          </div>
          <h1 className="hero-title">{shift} shift</h1>
          <div className="hero-lead">
            <Icon name="user" size={18} />
            {actorName ? (
              <span>{isKitchen ? 'Shift Lead' : 'Logging as'} <strong>{actorName}</strong></span>
            ) : (
              <span>No Shift Lead selected</span>
            )}
            {shiftDef && <span className="hero-since">· started {formatClock(shiftDef.start)}</span>}
          </div>
        </div>
        <Link to="/checklists" className="ticket">
          <span className="ticket-head">{current.length ? `${shift} checklists` : 'Today’s checklists'}</span>
          <Ring done={focusDone} total={focusTotal} size={96} stroke={9} label={`${focusDone} of ${focusTotal} tasks`} />
          <span className="ticket-count"><b>{focusDone}</b> of {focusTotal} tasks</span>
        </Link>
      </section>

      <div className="kpis">
        <Link to="/checklists" className="kpi sec-checklists">
          <span className="kpi-icon"><Icon name="check" size={20} /></span>
          <span className="kpi-label">Checklists today</span>
          <span className="kpi-value">{allTotal ? Math.round((allDone / allTotal) * 100) : 0}<small>%</small></span>
          <span className="kpi-note">{allDone} of {allTotal} tasks</span>
        </Link>
        <Link to="/waste" className="kpi sec-waste">
          <span className="kpi-icon"><Icon name="trash" size={20} /></span>
          <span className="kpi-label">Waste entries</span>
          <span className="kpi-value">{waste.length}</span>
          <span className="kpi-note">{topWaste[0] ? `Most: ${topWaste[0].item}` : 'Nothing logged yet'}</span>
        </Link>
        <Link to="/equipment" className={`kpi sec-equipment ${issues.length ? 'kpi-danger' : ''}`}>
          <span className="kpi-icon"><Icon name="alert" size={20} /></span>
          <span className="kpi-label">Open issues</span>
          <span className="kpi-value">{issues.length}</span>
          <span className="kpi-note">{issues.length ? 'Needs attention' : 'All equipment OK'}</span>
        </Link>
        <Link to="/equipment" className={`kpi sec-equipment ${dueCount ? 'kpi-warn' : ''}`}>
          <span className="kpi-icon"><Icon name="clock" size={20} /></span>
          <span className="kpi-label">Tasks due</span>
          <span className="kpi-value">{dueCount}<small>/{tracked.length}</small></span>
          <span className="kpi-note">{tracked.length ? 'Recurring equipment tasks' : 'None scheduled'}</span>
        </Link>
      </div>

      <div className="quick">
        <Link to="/checklists" className="quick-btn sec-checklists"><span className="quick-icon"><Icon name="check" size={22} /></span>Check off tasks</Link>
        <Link to="/waste" className="quick-btn sec-waste"><span className="quick-icon"><Icon name="trash" size={22} /></span>Log waste</Link>
        <Link to={equipment[0] ? `/equipment?log=${equipment[0].id}&issue=1` : '/equipment'} className="quick-btn quick-danger">
          <span className="quick-icon"><Icon name="alert" size={22} /></span>Report an issue
        </Link>
      </div>

      <div className="dash-grid">
        <section className="card sec-checklists">
          <div className="card-head">
            <h2><span className="dot" />Today's checklists</h2>
            <Link to="/checklists" className="link-more">View all <Icon name="chevron" size={16} /></Link>
          </div>
          {sortedProgress.length === 0 ? (
            <p className="muted">No checklists yet. Add them in Setup → Checklists.</p>
          ) : (
            <ul className="mini-list">
              {sortedProgress.map((p) => (
                <li key={p.template.id}>
                  <Link to={`/checklists/${p.template.id}`} className="mini-row">
                    <span className="mini-name">
                      {p.template.name}
                      {p.template.shift === shift && <span className="pill pill-accent">Now</span>}
                      {p.template.frequency === 'weekly' && <span className="pill">Weekly</span>}
                    </span>
                    <span className={`count ${p.total > 0 && p.done === p.total ? 'count-done' : ''}`}>{p.done}/{p.total}</span>
                  </Link>
                  <Progress done={p.done} total={p.total} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card sec-equipment">
          <div className="card-head">
            <h2><span className="dot dot-danger" />Open equipment issues</h2>
            <Link to="/equipment" className="link-more">Equipment <Icon name="chevron" size={16} /></Link>
          </div>
          {issues.length === 0 ? (
            <div className="all-clear"><Icon name="done" size={18} /> No open issues</div>
          ) : (
            <ul className="issue-list">
              {issues.map((i) => (
                <li key={i.id} className="issue">
                  <strong>{nameOf(i.equipment_id)}</strong>
                  <span>{i.notes}</span>
                  <span className="meta">{timeAgo(i.logged_at)} · {i.performed_by_name}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card sec-waste">
          <div className="card-head">
            <h2><span className="dot" />Waste today</h2>
            <Link to="/waste" className="link-more">Waste log <Icon name="chevron" size={16} /></Link>
          </div>
          {topWaste.length === 0 ? (
            <p className="muted">Nothing logged today.</p>
          ) : (
            <ul className="bars">
              {topWaste.map((t) => (
                <li key={`${t.item}|${t.unit}`}>
                  <div className="bars-row">
                    <span>{t.item}</span>
                    <span className="num">{+t.qty.toFixed(2)} <small>{t.unit}</small></span>
                  </div>
                  <div className="bar"><div style={{ width: `${(t.qty / maxWaste) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card sec-equipment">
          <div className="card-head">
            <h2><span className="dot" />Recurring tasks</h2>
            <Link to="/equipment" className="link-more">Equipment <Icon name="chevron" size={16} /></Link>
          </div>
          {tracked.length === 0 ? (
            <p className="muted">No recurring tasks. In Setup → Equipment, set one for any item, e.g. "Filter change every 12 hrs".</p>
          ) : (
            <div className="fryer-grid">
              {tracked.map(({ eq, t }) => (
                <Link key={eq.id} to={`/equipment?log=${eq.id}`} className={`fryer ${t.due ? 'fryer-due' : t.soon ? 'fryer-soon' : 'fryer-ok'}`}>
                  <span className="fryer-name"><Icon name={categoryIcon(eq.category)} size={16} /> {eq.name}</span>
                  <span className="fryer-time">{t.last ? `${t.action} ${timeAgo(t.last.logged_at)}` : `No ${t.action.toLowerCase()} yet`}</span>
                  <span className="fryer-state">{t.due ? (t.last ? 'Overdue' : 'Due now') : t.soon ? 'Due soon' : dueText(t).replace(`${t.action} `, '')}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
