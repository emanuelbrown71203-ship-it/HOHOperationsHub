import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import type { HohLead, PointValues } from '../lib/types';
import { POINT_LABELS, addUp, withDefaults, type PointBreakdown, type ShiftPoints } from '../lib/usePoints';
import { Meter } from './ScoreCharts';
import Icon from './Icon';

const KEYS = Object.keys(POINT_LABELS) as (keyof PointValues)[];

/** "10 per checklist · 5 per handoff · …" */
export function PointRules() {
  const { settings, isAdmin } = useApp();
  const v = withDefaults(settings.point_values);
  return (
    <p className="muted small point-rules">
      Every shift earns points for its Shift Lead, and they add up: {KEYS.filter((k) => v[k] > 0).map((k) => `${v[k]} for ${POINT_LABELS[k].each}`).join(' · ')}.
      {isAdmin && <> <Link to="/setup?tab=scores">Change the points</Link></>}
    </p>
  );
}

export function Breakdown({ b }: { b: PointBreakdown }) {
  const parts = KEYS.filter((k) => b[k] > 0);
  if (parts.length === 0) return <span className="muted small">No points yet</span>;
  return (
    <span className="pt-chips">
      {parts.map((k) => <span key={k} className={`pt-chip pt-${k}`}>{POINT_LABELS[k].label} <b>{b[k]}</b></span>)}
    </span>
  );
}

/** Every lead's points for a period, highest first. */
export default function PointsBoard({ leads, byLead, range, periodLabel }: { leads: HohLead[]; byLead: Map<string, ShiftPoints[]>; range: string; periodLabel: string }) {
  const { settings } = useApp();
  const v = withDefaults(settings.point_values);
  const rows = leads
    .map((lead) => ({ lead, p: addUp(byLead.get(lead.id) ?? [], v) }))
    .filter((r) => r.lead.active || r.p.total > 0)
    .sort((a, b) => b.p.total - a.p.total || a.lead.name.localeCompare(b.lead.name));
  const max = Math.max(1, ...rows.map((r) => r.p.total));
  return (
    <section className="card points-card">
      <div className="card-head">
        <h2><span className="dot" />Points</h2>
        <span className="muted small">{periodLabel}</span>
      </div>
      <PointRules />
      {rows.length === 0 ? (
        <p className="muted">No HOH Leads yet.</p>
      ) : (
        <ol className="points-list">
          {rows.map(({ lead, p }, i) => (
            <li key={lead.id}>
              <Link to={`/scores/${lead.id}?range=${range}`} className="points-row">
                <span className="rank">{p.total > 0 ? i + 1 : '–'}</span>
                <span className="avatar" aria-hidden="true">{lead.name.slice(0, 1).toUpperCase()}</span>
                <span className="points-main">
                  <span className="points-top">
                    <strong>{lead.name}</strong>
                    <span className="points-total">{p.total.toLocaleString()} <small>pts</small></span>
                  </span>
                  <Meter value={p.total} max={max} label={`${lead.name}: ${p.total} points from ${p.shifts} shifts`} />
                  <span className="points-sub"><Breakdown b={p} /> <span className="muted small">· {p.shifts} shift{p.shifts === 1 ? '' : 's'}</span></span>
                </span>
                <Icon name="chevron" size={18} />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
