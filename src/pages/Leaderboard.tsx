import { useApp } from '../lib/app';
import { POINT_LABELS, withDefaults } from '../lib/usePoints';
import LeaderboardCard from '../components/Leaderboard';
import LeadOfMonthBanner from '../components/LeadOfMonth';
import Icon from '../components/Icon';

export default function Leaderboard() {
  const { settings } = useApp();
  const v = withDefaults(settings.point_values);
  const keys = (Object.keys(POINT_LABELS) as (keyof typeof POINT_LABELS)[]).filter((k) => v[k] > 0);
  return (
    <div className="page narrow sec-scores">
      <div className="page-title">
        <span className="page-icon"><Icon name="trophy" size={22} /></span>
        <h1>Leaderboard</h1>
      </div>
      <p className="muted lede">The HOH Leads with the most points. Every shift earns points for the Shift Lead who ran it, and the board starts fresh every week and every month.</p>
      <LeaderboardCard />
      <section className="card">
        <h2>How to earn points</h2>
        <ul className="earn-list">
          {keys.map((k) => (
            <li key={k}>
              <span className="earn-points">+{v[k]}</span>
              <span>{POINT_LABELS[k].each[0].toUpperCase() + POINT_LABELS[k].each.slice(1)}</span>
            </li>
          ))}
        </ul>
        <p className="muted small">Points go to the Shift Lead on record for the shift. The store tablet records whoever is picked as Shift Lead.</p>
      </section>
      <LeadOfMonthBanner />
    </div>
  );
}
