import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { navGroups, tabItems } from '../lib/nav';
import Icon from '../components/Icon';

/** Everything that isn't in the phone tab bar, grouped like the menu, each with a line saying what it's for. */
export function MoreList({ badges = {}, onNavigate }: { badges?: Record<string, number>; onNavigate?: () => void }) {
  const { isAdmin, canSchedule, canViewScores, profile } = useApp();
  const ctx = { isAdmin, canSchedule, canViewScores };
  const inTabs = new Set(tabItems(ctx).map((t) => t.to));
  const groups = navGroups(ctx)
    .map((g) => ({ ...g, items: g.items.filter((i) => !inTabs.has(i.to)) }))
    .filter((g) => g.items.length > 0);
  return (
    <div className="stack">
      {groups.map((g) => (
        <section key={g.key} className="stack-sm">
          <h2 className="section-title">{g.title}</h2>
          <div className="more-list">
            {g.items.map((i) => (
              <Link key={i.to} to={i.to} className={`more-item sec-${i.section}`} onClick={onNavigate}>
                <span className="kpi-icon"><Icon name={i.icon} size={20} /></span>
                <span className="grow"><strong>{i.label}</strong><small className="muted">{i.hint}</small></span>
                {!!badges[i.to] && <span className="count-badge">{badges[i.to]}</span>}
                <Icon name="chevron" />
              </Link>
            ))}
          </div>
        </section>
      ))}
      <section className="stack-sm">
        <h2 className="section-title">You</h2>
        <div className="more-list">
          <Link to="/account" className="more-item sec-home" onClick={onNavigate}>
            <span className="kpi-icon"><Icon name="user" size={20} /></span>
            <span className="grow"><strong>Account</strong><small className="muted">{profile?.full_name ?? ''} · notifications, theme, celebrations, sign out</small></span>
            <Icon name="chevron" />
          </Link>
        </div>
      </section>
    </div>
  );
}

export default function More() {
  return (
    <div className="page narrow">
      <h1>More</h1>
      <MoreList />
    </div>
  );
}
