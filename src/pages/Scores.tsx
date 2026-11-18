import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { formatDay } from '../lib/dates';
import { downloadCsv } from '../lib/csv';
import { SCORES_VISIBILITY_LABELS, type RatingRecord } from '../lib/types';
import { SCORE_RANGES, fmtAvg, pct, rangeWindow, statsFor, useScoreRange, useScores, type ScoreRange } from '../lib/useScores';
import { Delta, Meter, StatTile } from '../components/ScoreCharts';
import Stars from '../components/Stars';
import Icon from '../components/Icon';

export const PERIOD_WORDS: Record<ScoreRange, string | undefined> = { '30d': 'previous 30 days', '90d': 'previous 90 days', all: undefined };

export function exportRatings(records: RatingRecord[], name: string) {
  downloadCsv(
    `${name}.csv`,
    ['Date', 'Shift', 'HOH Lead', 'Stars', 'Comment', 'Rated by', 'Rated at', 'Handoff submitted', 'Photos'],
    records.map((r) => [r.shift_date, r.shift, r.lead_name ?? '', r.rating, r.comment ?? '', r.rated_by_name, new Date(r.rated_at).toLocaleString(), r.handoff_submitted ? 'Yes' : 'No', r.photo_count]),
  );
}

export function RangeFilter({ range }: { range: ScoreRange }) {
  const [params, setParams] = useSearchParams();
  return (
    <div className="segmented segmented-sm" role="tablist" aria-label="Date range">
      {SCORE_RANGES.map((r) => (
        <button
          key={r.key}
          role="tab"
          aria-selected={range === r.key}
          className={range === r.key ? 'on' : ''}
          onClick={() => {
            const next = new URLSearchParams(params);
            next.set('range', r.key);
            setParams(next, { replace: true });
          }}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

export default function Scores() {
  const { today, shift, settings, isAdmin } = useApp();
  const [params] = useSearchParams();
  const range = useScoreRange(params);
  const { records, shifts, leads, loading } = useScores();
  const current = { date: today, shift };
  const { start } = rangeWindow(range, today);
  const inRange = records.filter((r) => !start || r.shift_date >= start);
  const store = statsFor(null, records, shifts, range, today, current);
  const ratedShifts = new Set(inRange.map((r) => r.handoff_id)).size;

  const rows = leads
    .map((l) => ({ lead: l, s: statsFor(l.id, records, shifts, range, today, current) }))
    .filter((r) => r.lead.active || r.s.count > 0 || r.s.shiftsLed > 0)
    .sort((a, b) => (b.s.avg ?? -1) - (a.s.avg ?? -1) || b.s.count - a.s.count || a.lead.name.localeCompare(b.lead.name));
  const ranked = rows.filter((r) => r.s.count > 0);
  const unranked = rows.filter((r) => r.s.count === 0);
  const comments = inRange.filter((r) => r.comment).slice(0, 8);
  const period = PERIOD_WORDS[range];

  return (
    <div className="page sec-scores">
      <div className="page-head">
        <div className="page-title">
          <span className="page-icon"><Icon name="trophy" size={22} /></span>
          <h1>Lead Scores</h1>
        </div>
      </div>
      <p className="muted lede">
        The incoming shift rates the previous shift's setup from 1 to 5 stars. Each rating is credited to the HOH Lead who ran that shift.
        Visible to: <strong>{SCORES_VISIBILITY_LABELS[settings.scores_visibility]}</strong>
        {isAdmin && <> · <Link to="/setup?tab=store">change</Link></>}
      </p>

      <div className="filter-row">
        <RangeFilter range={range} />
        <button className="btn btn-ghost btn-sm" onClick={() => exportRatings(inRange, `lead-scores-${range}-${today}`)} disabled={inRange.length === 0}>
          <Icon name="download" size={16} /> Export ratings
        </button>
      </div>

      {loading ? (
        <div className="spinner" />
      ) : (
        <>
          <div className="stat-row">
            <StatTile
              label="Store average"
              value={fmtAvg(store.avg)}
              unit="/ 5"
              delta={range !== 'all' ? <Delta value={store.delta} period={period} /> : undefined}
              note={range === 'all' ? `${store.count} ratings` : undefined}
            />
            <StatTile
              label="Shifts rated"
              value={String(ratedShifts)}
              note={store.shiftsLed ? `of ${store.shiftsLed} shifts with a recorded lead (${pct(ratedShifts, store.shiftsLed)}%)` : 'No shifts recorded yet'}
            />
            <StatTile
              label="Handoffs submitted"
              value={pct(store.submitted, store.shiftsLed) === null ? '–' : `${pct(store.submitted, store.shiftsLed)}%`}
              note={store.shiftsLed ? `${store.submitted} of ${store.shiftsLed} shifts` : undefined}
            />
          </div>

          <section className="card">
            <div className="card-head">
              <h2><span className="dot" />HOH Leads</h2>
              <span className="muted small">Average stars · tap a lead for their full record</span>
            </div>
            {rows.length === 0 ? (
              <p className="muted">No HOH Leads yet. An admin can add them in Setup → HOH Leads.</p>
            ) : (
              <ol className="meter-list">
                {ranked.map(({ lead, s }, i) => (
                  <li key={lead.id}>
                    <Link to={`/scores/${lead.id}?range=${range}`} className="meter-row">
                      <span className="rank">{i + 1}</span>
                      <span className="avatar" aria-hidden="true">{lead.name.slice(0, 1).toUpperCase()}</span>
                      <span className="meter-name">
                        <strong>{lead.name}</strong>
                        <small>
                          {s.count} rating{s.count === 1 ? '' : 's'}
                          {s.shiftsLed > 0 && ` · ${pct(s.submitted, s.shiftsLed)}% handoffs`}
                          {!lead.active && ' · hidden'}
                        </small>
                      </span>
                      <Meter value={s.avg} label={`${lead.name}: ${fmtAvg(s.avg)} out of 5 from ${s.count} ratings`} />
                      <span className="meter-value">{fmtAvg(s.avg)}</span>
                      <span className="meter-delta">
                        {range !== 'all' && s.delta !== null && <Delta value={s.delta} />}
                        {s.avg !== null && s.avg < 3 && s.count >= 3 && (
                          <span className="flag"><Icon name="alert" size={14} /> Needs attention</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
                {unranked.map(({ lead, s }) => (
                  <li key={lead.id}>
                    <Link to={`/scores/${lead.id}?range=${range}`} className="meter-row is-empty">
                      <span className="rank">–</span>
                      <span className="avatar" aria-hidden="true">{lead.name.slice(0, 1).toUpperCase()}</span>
                      <span className="meter-name">
                        <strong>{lead.name}</strong>
                        <small>{s.shiftsLed ? `${s.shiftsLed} shift${s.shiftsLed === 1 ? '' : 's'} led, not rated yet` : 'No rated shifts in this period'}</small>
                      </span>
                      <Meter value={null} label={`${lead.name}: no ratings`} />
                      <span className="meter-value muted">–</span>
                      <span className="meter-delta" />
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2><span className="dot" />Latest comments</h2>
            </div>
            {comments.length === 0 ? (
              <p className="muted">No comments in this period.</p>
            ) : (
              <ul className="comment-list">
                {comments.map((r) => (
                  <li key={r.handoff_id}>
                    <div className="comment-top">
                      <Stars value={r.rating} size="sm" />
                      <span><strong>{r.lead_name}</strong> · {r.shift} shift, {formatDay(r.shift_date)}</span>
                    </div>
                    <p>“{r.comment}”</p>
                    <span className="muted small">Rated by {r.rated_by_name}</span>
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
