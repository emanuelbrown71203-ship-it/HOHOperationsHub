import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorMessage } from '../lib/supabase';
import { formatDay } from '../lib/dates';
import type { RatingRecord } from '../lib/types';
import { categoryAverages, fmtAvg, pct, rangeWindow, statsFor, streakFor, useScoreRange, useScores, weeklySeries } from '../lib/useScores';
import { CategoryChips } from './Handoff';
import { Delta, StarBreakdown, StatTile, TrendChart } from '../components/ScoreCharts';
import Stars, { RATING_WORDS } from '../components/Stars';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import { useConfirm } from '../components/Confirm';
import { CategoryMeters, PERIOD_WORDS, RangeFilter, exportRatings } from './Scores';

export default function LeadScore() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const range = useScoreRange(params);
  const { today, shift, isDirector, isAdmin, toast, settings } = useApp();
  const confirm = useConfirm();
  const { records, shifts, leads, loading, reload } = useScores();
  const [moving, setMoving] = useState<RatingRecord | null>(null);
  const lead = leads.find((l) => l.id === id);
  const { start } = rangeWindow(range, today);

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (!lead) {
    return (
      <div className="page">
        <Link to="/scores" className="back-link"><Icon name="back" /> Lead Scores</Link>
        <div className="empty">This HOH Lead was not found.</div>
      </div>
    );
  }

  const s = statsFor(lead.id, records, shifts, range, today, { date: today, shift });
  const mine = records.filter((r) => r.lead_id === lead.id && (!start || r.shift_date >= start));
  const weeks = weeklySeries(lead.id, records, range, today);
  const period = PERIOD_WORDS[range];
  const cats = categoryAverages(mine, settings.rating_categories);
  const streak = streakFor(lead.id, records);

  async function removeRating(r: RatingRecord) {
    if (!(await confirm({ title: 'Delete this rating?', body: `${r.rating} star${r.rating > 1 ? 's' : ''} for the ${r.shift} shift on ${formatDay(r.shift_date)}, from ${r.rated_by_name}. The shift can then be rated again.`, confirmLabel: 'Delete rating', danger: true }))) return;
    const { error } = await supabase.from('shift_ratings').delete().eq('handoff_id', r.handoff_id);
    if (error) return toast(errorMessage(error), 'error');
    toast('Rating deleted');
    reload();
  }

  return (
    <div className="page sec-scores">
      <Link to={`/scores?range=${range}`} className="back-link"><Icon name="back" /> Lead Scores</Link>
      <div className="lead-head">
        <span className="avatar avatar-lg" aria-hidden="true">{lead.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <span className="shift-tag">HOH Lead{!lead.active && ' · hidden'}</span>
          <h1>{lead.name}</h1>
          {streak >= 3 && <span className="streak"><Icon name="flame" size={14} /> {streak} shifts in a row at 4 stars or better</span>}
        </div>
      </div>

      <div className="filter-row">
        <RangeFilter range={range} />
        <button className="btn btn-ghost btn-sm" onClick={() => exportRatings(mine, `${lead.name}-scores-${range}-${today}`)} disabled={mine.length === 0}>
          <Icon name="download" size={16} /> Export {lead.name}'s ratings
        </button>
      </div>

      <div className="stat-row">
        <StatTile label="Average" value={fmtAvg(s.avg)} unit="/ 5" delta={range !== 'all' ? <Delta value={s.delta} period={period} /> : undefined} />
        <StatTile label="Ratings" value={String(s.count)} note={s.shiftsLed ? `from ${s.shiftsLed} shifts led` : undefined} />
        <StatTile
          label="Handoffs submitted"
          value={pct(s.submitted, s.shiftsLed) === null ? '–' : `${pct(s.submitted, s.shiftsLed)}%`}
          note={s.shiftsLed ? `${s.submitted} of ${s.shiftsLed} shifts` : 'No shifts recorded'}
        />
      </div>

      <div className="score-grid">
        <section className="card">
          <div className="card-head"><h2><span className="dot" />Weekly average</h2></div>
          <TrendChart weeks={weeks} leadName={lead.name} />
        </section>
        <section className="card">
          <div className="card-head"><h2><span className="dot" />Star breakdown</h2></div>
          {s.count === 0 ? <p className="muted">No ratings in this period.</p> : <StarBreakdown dist={s.dist} />}
        </section>
      </div>

      {cats.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2><span className="dot" />By category</h2>
            <span className="muted small">Where {lead.name} is strong, and what to work on</span>
          </div>
          <CategoryMeters cats={cats} />
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2><span className="dot" />Every rating</h2>
          <span className="muted small">{mine.length} in this period</span>
        </div>
        {mine.length === 0 ? (
          <p className="muted">No ratings in this period.</p>
        ) : (
          <ul className="rating-list">
            {mine.map((r) => (
              <li key={r.handoff_id} className={`rating-item stars-${r.rating}`}>
                <div className="rating-when">
                  <strong>{formatDay(r.shift_date)}</strong>
                  <span className="muted small">{r.shift} shift</span>
                </div>
                <div className="rating-main">
                  <div className="row-gap wrap">
                    <Stars value={r.rating} size="sm" />
                    <span className="small"><strong>{RATING_WORDS[r.rating]}</strong>{r.category_scores ? ` · ${r.score.toFixed(1)}` : ''}</span>
                  </div>
                  <CategoryChips scores={r.category_scores} />
                  {r.comment && <p className="rated-comment">“{r.comment}”</p>}
                  <span className="muted small">
                    Rated by {r.rated_by_name} · {r.handoff_submitted ? `handoff submitted, ${r.photo_count} photo${r.photo_count === 1 ? '' : 's'}` : 'handoff not submitted'}
                  </span>
                </div>
                {(isDirector || isAdmin) && (
                  <div className="rating-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setMoving(r)}>Wrong lead?</button>
                    <button className="icon-btn" onClick={() => removeRating(r)} aria-label="Delete rating"><Icon name="trash" size={16} /></button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {moving && <ReassignModal record={moving} onClose={() => setMoving(null)} onSaved={reload} />}
    </div>
  );
}

function ReassignModal({ record, onClose, onSaved }: { record: RatingRecord; onClose: () => void; onSaved: () => void }) {
  const { leads, toast } = useApp();
  const [leadId, setLeadId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!leadId) return toast('Choose the correct Shift Lead', 'error');
    setSaving(true);
    const { error } = await supabase.rpc('set_shift_lead', { p_date: record.shift_date, p_shift: record.shift, p_lead_id: leadId });
    setSaving(false);
    if (error) return toast(errorMessage(error), 'error');
    toast(`Moved to ${leads.find((l) => l.id === leadId)?.name}`);
    onSaved();
    onClose();
  }
  return (
    <Modal title="Who ran this shift?" onClose={onClose}>
      <p className="muted">
        {record.shift} shift, {formatDay(record.shift_date)} · {record.rating} star{record.rating > 1 ? 's' : ''}, currently credited to <strong>{record.lead_name}</strong>.
      </p>
      <div className="chips">
        {leads.filter((l) => l.id !== record.lead_id).map((l) => (
          <button key={l.id} type="button" className={`chip ${leadId === l.id ? 'on' : ''}`} onClick={() => setLeadId(l.id)}>{l.name}</button>
        ))}
      </div>
      <button className="btn btn-primary btn-block" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Move rating'}</button>
    </Modal>
  );
}
