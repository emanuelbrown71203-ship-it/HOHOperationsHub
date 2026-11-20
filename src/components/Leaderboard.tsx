import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { useLeaderboard, type BoardPeriod, type BoardRow } from '../lib/useLeaderboard';
import { monthName, useLeadOfMonth } from '../lib/useScores';
import Icon from './Icon';

const PERIOD_LABEL: Record<BoardPeriod, string> = { week: 'This week', month: 'This month' };

/**
 * The leaderboard: the top 5 HOH Leads by points. It celebrates the top and never shows the bottom:
 * no last place, no breakdowns, and anyone not on the board only sees their own count, on their own phone.
 */
export default function LeaderboardCard({ compact = false }: { compact?: boolean }) {
  const { today, isKitchen, myLeadId } = useApp();
  const [period, setPeriod] = useState<BoardPeriod>('month');
  const { rows, mine, loading } = useLeaderboard(period, today, !isKitchen && !!myLeadId);
  const { winner } = useLeadOfMonth(today);
  const podium = rows.filter((r) => r.place <= 3);
  const rest = rows.filter((r) => r.place > 3);
  const title = period === 'month' ? `${monthName(`${today.slice(0, 7)}-01`)} leaderboard` : 'This week’s leaderboard';

  return (
    <section className={`card board ${compact ? 'compact' : ''}`} aria-labelledby="board-title">
      <div className="card-head">
        <h2 id="board-title"><Icon name="trophy" size={20} /> {title}</h2>
        <div className="segmented segmented-sm" role="tablist" aria-label="Period">
          {(['week', 'month'] as BoardPeriod[]).map((p) => (
            <button key={p} role="tab" aria-selected={period === p} className={period === p ? 'on' : ''} onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="spinner" />
      ) : rows.length === 0 ? (
        <p className="muted board-empty">No points yet {period === 'week' ? 'this week' : 'this month'}. Finish checklists, handoffs and cleaning to get on the board.</p>
      ) : (
        <>
          <ol className="podium" aria-label="Top 3">
            {/* 1st sits in the middle and highest; ties share a place. */}
            {podium.map((r: BoardRow) => (
                <li key={r.lead_id} className={`podium-spot place-${r.place}`}>
                  <span className="medal" aria-hidden="true">{r.place}</span>
                  <span className="avatar" aria-hidden="true">{r.name.slice(0, 1).toUpperCase()}</span>
                  <strong className="podium-name">{r.name}</strong>
                  <span className="podium-points">{r.points.toLocaleString()} <small>pts</small></span>
                  <span className="sr-only">Place {r.place}</span>
                </li>
              ))}
          </ol>
          {rest.length > 0 && (
            <ol className="board-rest" aria-label="Places 4 and 5">
              {rest.map((r) => (
                <li key={r.lead_id}>
                  <span className="board-place">{r.place}</span>
                  <span className="avatar sm" aria-hidden="true">{r.name.slice(0, 1).toUpperCase()}</span>
                  <strong>{r.name}</strong>
                  <span className="board-points">{r.points.toLocaleString()} pts</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {mine && !mine.on_board && rows.length > 0 && (
        <p className="board-nudge">
          <Icon name="sparkle" size={16} />
          <span>You have <strong>{mine.points.toLocaleString()} points</strong>. {mine.to_board > 0 ? `${mine.to_board.toLocaleString()} more puts you on the board.` : 'Keep going!'} Only you can see this.</span>
        </p>
      )}
      {mine?.on_board && <p className="board-nudge on"><Icon name="trophy" size={16} /><span>You’re on the board. Nice work!</span></p>}

      <div className="board-foot">
        {compact && winner && <span><Icon name="award" size={14} /> {monthName(winner.month)} Lead of the Month: <strong>{winner.name}</strong></span>}
        <span className="muted small">The board shows the top 5 and never who’s last.</span>
        {compact && <Link to="/leaderboard" className="link-more">How points work <Icon name="chevron" size={16} /></Link>}
      </div>
    </section>
  );
}
