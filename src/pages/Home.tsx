import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { useRealtime } from '../lib/useRealtime';
import { useChecklists } from '../lib/useChecklists';
import { formatDay, timeAgo } from '../lib/dates';
import type { Equipment, EquipmentLog, WasteEntry } from '../lib/types';
import Progress from '../components/Progress';
import Icon from '../components/Icon';

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

  const topWaste = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of waste) {
      const k = `${e.item_name} (${e.unit})`;
      m.set(k, (m.get(k) ?? 0) + Number(e.quantity));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [waste]);

  const fryers = equipment.filter((e) => e.category === 'Fryer');
  const nameOf = (id: string) => equipment.find((e) => e.id === id)?.name ?? 'Equipment';

  return (
    <div className="page">
      <div className="hero">
        <div>
          <div className="muted">{formatDay(today)}</div>
          <h1>{shift} shift</h1>
          <div className="muted">
            {actorName ? (
              <>Logging as <strong>{actorName}</strong></>
            ) : isKitchen ? (
              'No Shift Lead selected'
            ) : null}
          </div>
        </div>
        <div className="quick">
          <Link to="/checklists" className="quick-btn"><Icon name="check" size={24} />Checklists</Link>
          <Link to="/waste" className="quick-btn"><Icon name="trash" size={24} />Log waste</Link>
          <Link to="/equipment" className="quick-btn"><Icon name="wrench" size={24} />Equipment</Link>
        </div>
      </div>

      <div className="dash-grid">
        <section className="card">
          <div className="row-between">
            <h2>Today's checklists</h2>
            <Link to="/checklists" className="small">View all</Link>
          </div>
          {sortedProgress.length === 0 ? (
            <p className="muted">No checklists set up.</p>
          ) : (
            <ul className="mini-list">
              {sortedProgress.map((p) => (
                <li key={p.template.id}>
                  <Link to={`/checklists/${p.template.id}`} className="mini-row">
                    <span>
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

        <section className={`card ${issues.length ? 'card-alert' : ''}`}>
          <div className="row-between">
            <h2>Open equipment issues</h2>
            <Link to="/equipment" className="small">Equipment</Link>
          </div>
          {issues.length === 0 ? (
            <p className="muted">No open issues. 👍</p>
          ) : (
            <ul className="entries compact">
              {issues.map((i) => (
                <li key={i.id} className="entry">
                  <div className="entry-main">
                    <strong>{nameOf(i.equipment_id)}</strong>
                    <span>{i.notes}</span>
                    <span className="muted small">{timeAgo(i.logged_at)} · {i.performed_by_name}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="row-between">
            <h2>Waste today</h2>
            <Link to="/waste" className="small">Waste log</Link>
          </div>
          {waste.length === 0 ? (
            <p className="muted">Nothing logged today.</p>
          ) : (
            <>
              <div className="stat">{waste.length} <span>entr{waste.length === 1 ? 'y' : 'ies'}</span></div>
              <ul className="mini-list">
                {topWaste.map(([k, q]) => (
                  <li key={k} className="mini-row"><span>{k}</span><span className="num">{+q.toFixed(2)}</span></li>
                ))}
              </ul>
            </>
          )}
        </section>

        {fryers.length > 0 && (
          <section className="card">
            <h2>Fryer filters</h2>
            <ul className="mini-list">
              {fryers.map((f) => {
                const last = logs.find((l) => l.equipment_id === f.id);
                const stale = !last || Date.now() - new Date(last.logged_at).getTime() > 12 * 3600 * 1000;
                return (
                  <li key={f.id}>
                    <Link to={`/equipment?log=${f.id}`} className="mini-row">
                      <span>{f.name}</span>
                      <span className={`small ${stale ? 'text-warn' : 'muted'}`}>{last ? timeAgo(last.logged_at) : 'Never'}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
