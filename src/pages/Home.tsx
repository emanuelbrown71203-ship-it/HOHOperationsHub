import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { useRealtime } from '../lib/useRealtime';
import { useChecklists } from '../lib/useChecklists';
import { formatDay, timeAgo } from '../lib/dates';
import type { Equipment, EquipmentLog, WasteEntry } from '../lib/types';
import Progress from '../components/Progress';
import Ring from '../components/Ring';
import DayDot from '../components/DayDot';
import Icon from '../components/Icon';

const FILTER_DUE_HOURS = 12;

export default function Home() {
  const { today, shift, actorName, isKitchen } = useApp();
  const { progress } = useChecklists(today);
  const [waste, setWaste] = useState<WasteEntry[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [logs, setLogs] = useState<EquipmentLog[]>([]);
  const [issues, setIssues] = useState<EquipmentLog[]>([]);

  const load = useCallback(async () => {
    const [w, eq, lg, op] = await Promise.all([
      supabase.from('waste_entries').select('*').eq('log_date', today),
      supabase.from('equipment').select('*').eq('active', true).order('sort_order'),
      supabase.from('equipment_logs').select('*').eq('log_type', 'filter_change').order('logged_at', { ascending: false }).limit(100),
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
  useRealtime(['waste_entries', 'equipment_logs'], load);

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

  const fryers = equipment.filter((e) => e.category === 'Fryer');
  const fryerStatus = fryers.map((f) => {
    const last = logs.find((l) => l.equipment_id === f.id);
    const due = !last || Date.now() - new Date(last.logged_at).getTime() > FILTER_DUE_HOURS * 3600 * 1000;
    return { fryer: f, last, due };
  });
  const fryersDue = fryerStatus.filter((f) => f.due).length;
  const nameOf = (id: string) => equipment.find((e) => e.id === id)?.name ?? 'Equipment';

  return (
    <div className="page">
      <section className="hero">
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
          </div>
        </div>
        <div className="hero-ring">
          <Ring done={focusDone} total={focusTotal} size={112} stroke={10} label={`${shift} checklists: ${focusDone} of ${focusTotal}`} />
          <span>{current.length ? `${shift} tasks` : 'Today’s tasks'}<br /><b>{focusDone} of {focusTotal}</b></span>
        </div>
      </section>

      <div className="kpis">
        <Link to="/checklists" className="kpi">
          <span className="kpi-label">Checklists today</span>
          <span className="kpi-value">{allTotal ? Math.round((allDone / allTotal) * 100) : 0}<small>%</small></span>
          <span className="kpi-note">{allDone} of {allTotal} tasks</span>
        </Link>
        <Link to="/waste" className="kpi">
          <span className="kpi-label">Waste entries</span>
          <span className="kpi-value">{waste.length}</span>
          <span className="kpi-note">{topWaste[0] ? `Most: ${topWaste[0].item}` : 'Nothing logged yet'}</span>
        </Link>
        <Link to="/equipment" className={`kpi ${issues.length ? 'kpi-danger' : 'kpi-ok'}`}>
          <span className="kpi-label">Open issues</span>
          <span className="kpi-value">{issues.length}</span>
          <span className="kpi-note">{issues.length ? 'Needs attention' : 'All equipment OK'}</span>
        </Link>
        <Link to="/equipment" className={`kpi ${fryersDue ? 'kpi-warn' : 'kpi-ok'}`}>
          <span className="kpi-label">Fryers to filter</span>
          <span className="kpi-value">{fryersDue}<small>/{fryers.length}</small></span>
          <span className="kpi-note">Due after {FILTER_DUE_HOURS} hrs</span>
        </Link>
      </div>

      <div className="quick">
        <Link to="/checklists" className="quick-btn"><span className="quick-icon"><Icon name="check" size={22} /></span>Check off tasks</Link>
        <Link to="/waste" className="quick-btn"><span className="quick-icon"><Icon name="trash" size={22} /></span>Log waste</Link>
        <Link to={equipment[0] ? `/equipment?log=${equipment[0].id}&issue=1` : '/equipment'} className="quick-btn quick-danger">
          <span className="quick-icon"><Icon name="alert" size={22} /></span>Report an issue
        </Link>
      </div>

      <div className="dash-grid">
        <section className="card">
          <div className="card-head">
            <h2>Today's checklists</h2>
            <Link to="/checklists" className="link-more">View all <Icon name="chevron" size={16} /></Link>
          </div>
          {sortedProgress.length === 0 ? (
            <p className="muted">No checklists set up.</p>
          ) : (
            <ul className="mini-list">
              {sortedProgress.map((p) => (
                <li key={p.template.id}>
                  <Link to={`/checklists/${p.template.id}`} className="mini-row">
                    <span className="mini-name">
                      {p.template.name}
                      {p.template.shift === shift && <span className="pill pill-accent">Now</span>}
                    </span>
                    <span className={`count ${p.total > 0 && p.done === p.total ? 'count-done' : ''}`}>{p.done}/{p.total}</span>
                  </Link>
                  <Progress done={p.done} total={p.total} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Open equipment issues</h2>
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

        <section className="card">
          <div className="card-head">
            <h2>Waste today</h2>
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

        {fryers.length > 0 && (
          <section className="card">
            <div className="card-head">
              <h2>Fryer filters</h2>
              <span className="muted small">Due every {FILTER_DUE_HOURS} hrs</span>
            </div>
            <div className="fryer-grid">
              {fryerStatus.map(({ fryer, last, due }) => (
                <Link key={fryer.id} to={`/equipment?log=${fryer.id}`} className={`fryer ${due ? 'fryer-due' : 'fryer-ok'}`}>
                  <span className="fryer-name"><Icon name="flame" size={16} /> {fryer.name}</span>
                  <span className="fryer-time">{last ? timeAgo(last.logged_at) : 'Never'}</span>
                  <span className="fryer-state">{due ? 'Filter due' : 'Filtered'}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
