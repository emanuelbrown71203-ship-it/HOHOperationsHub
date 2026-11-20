import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { formatDay } from '../lib/dates';
import { fmtAvg, pct, statsFor, streakFor, useScores } from '../lib/useScores';
import { addUp, useLeadPoints, withDefaults } from '../lib/usePoints';
import { addDays } from '../lib/dates';
import { Delta, Meter } from './ScoreCharts';
import Stars from './Stars';
import Icon from './Icon';

const SHOWN = 5;

type ScoreData = Pick<ReturnType<typeof useScores>, 'records' | 'shifts' | 'leads' | 'loading'>;

/** The lead score record, first thing on Home for the people allowed to see it. */
export default function ScoreboardCard() {
  return <ScoreboardBody {...useScores()} />;
}

export function ScoreboardBody({ records, shifts, leads, loading }: ScoreData) {
  const { today, shift, settings } = useApp();
  const { byLead: points } = useLeadPoints(addDays(today, -29), today);
  const pv = withDefaults(settings.point_values);
  const ptsOf = (id: string) => addUp(points.get(id) ?? [], pv).total;
  const current = { date: today, shift };
  const store = statsFor(null, records, shifts, '30d', today, current);
  const ranked = leads
    .map((lead) => ({ lead, s: statsFor(lead.id, records, shifts, '30d', today, current), streak: streakFor(lead.id, records) }))
    .filter((r) => r.s.count > 0)
    .sort((a, b) => (b.s.avg ?? 0) - (a.s.avg ?? 0) || b.s.count - a.s.count || a.lead.name.localeCompare(b.lead.name));
  const top = ranked.slice(0, SHOWN);
  const latest = records.length ? records.reduce((a, b) => (b.rated_at > a.rated_at ? b : a)) : null;
  const handoffs = pct(store.submitted, store.shiftsLed);

  return (
    <section className="card scoreboard sec-scores" aria-labelledby="scoreboard-title">
      <div className="card-head">
        <h2 id="scoreboard-title">
          <span className="dot" />Lead scores <span className="scoreboard-period">Last 30 days</span>
        </h2>
        <Link to="/scores" className="link-more">Full record <Icon name="chevron" size={16} /></Link>
      </div>

      {loading ? (
        <div className="scoreboard-loading"><div className="spinner" /></div>
      ) : records.length === 0 ? (
        <p className="muted">
          No ratings yet. When the incoming shift rates the previous shift's setup, each HOH Lead's score shows up here.
        </p>
      ) : (
        <>
          <div className="scoreboard-body">
            <div className="scoreboard-store">
              <span className="stat-label">Store average</span>
              <span className="stat-value">
                {fmtAvg(store.avg)}
                <small>/ 5</small>
              </span>
              <Delta value={store.delta} period="previous 30 days" />
              <span className="muted small">
                {store.count} rating{store.count === 1 ? '' : 's'}
                {handoffs !== null && ` · ${handoffs}% of handoffs submitted`}
              </span>
            </div>
            {top.length === 0 ? (
              <p className="muted scoreboard-empty">No shifts rated in the last 30 days.</p>
            ) : (
              <ol className="meter-list scoreboard-list">
                {top.map(({ lead, s, streak }, i) => (
                  <li key={lead.id}>
                    <Link to={`/scores/${lead.id}`} className="meter-row scoreboard-row">
                      <span className="rank">{i + 1}</span>
                      <span className="avatar" aria-hidden="true">{lead.name.slice(0, 1).toUpperCase()}</span>
                      <span className="meter-name">
                        <strong>{lead.name}</strong>
                        <small>
                          {s.count} rating{s.count === 1 ? '' : 's'} · <b className="pts-inline">{ptsOf(lead.id).toLocaleString()} pts</b>
                          {streak >= 3 && <span className="streak"><Icon name="flame" size={12} /> {streak} in a row at 4+</span>}
                          {s.avg !== null && s.avg < 3 && s.count >= 3 && (
                            <span className="flag"><Icon name="alert" size={12} /> Needs attention</span>
                          )}
                        </small>
                      </span>
                      <Meter value={s.avg} label={`${lead.name}: ${fmtAvg(s.avg)} out of 5 from ${s.count} ratings`} />
                      <span className="meter-value">{fmtAvg(s.avg)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="scoreboard-foot">
            {latest && (
              <span className="scoreboard-latest">
                <Stars value={latest.rating} size="sm" />
                <span>
                  Latest: <strong>{latest.lead_name ?? 'No Shift Lead'}</strong> · {latest.shift} shift, {formatDay(latest.shift_date)} · rated by {latest.rated_by_name}
                </span>
              </span>
            )}
            {ranked.length > SHOWN && (
              <Link to="/scores" className="small">+{ranked.length - SHOWN} more lead{ranked.length - SHOWN === 1 ? '' : 's'}</Link>
            )}
          </div>
        </>
      )}
    </section>
  );
}
