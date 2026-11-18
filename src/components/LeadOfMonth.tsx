import { useApp } from '../lib/app';
import { monthName, useLeadOfMonth } from '../lib/useScores';
import Icon from './Icon';

/** Last month's winner and who is ahead this month. Names show for everyone; scores only for people allowed to see them. */
export default function LeadOfMonthBanner() {
  const { today } = useApp();
  const { winner, leader } = useLeadOfMonth(today);
  if (!winner && !leader) return null;
  return (
    <section className="lotm" aria-label="Lead of the Month">
      {winner && (
        <div className="lotm-main">
          <span className="lotm-badge" aria-hidden="true"><Icon name="award" size={26} /></span>
          <div>
            <span className="eyebrow">{monthName(winner.month)} Lead of the Month</span>
            <strong>{winner.name}</strong>
            {winner.avg !== null && <small>{Number(winner.avg).toFixed(1)} average from {winner.ratings} rated shifts</small>}
          </div>
        </div>
      )}
      {leader && (
        <div className="lotm-next">
          <span className="eyebrow">{winner ? `Leading ${monthName(leader.month)}` : `Leading ${monthName(leader.month)} so far`}</span>
          <strong>{leader.name}</strong>
          {leader.avg !== null && <small>{Number(leader.avg).toFixed(1)} from {leader.ratings} shifts</small>}
        </div>
      )}
    </section>
  );
}
