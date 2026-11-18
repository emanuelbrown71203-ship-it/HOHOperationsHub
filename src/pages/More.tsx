import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { navGroups, tabItems } from '../lib/nav';
import Icon from '../components/Icon';

/** Everything that isn't in the phone tab bar, grouped the same way as the menu. */
export default function More() {
  const { isAdmin, canSchedule, canViewScores, profile } = useApp();
  const ctx = { isAdmin, canSchedule, canViewScores };
  const inTabs = new Set(tabItems(ctx).map((t) => t.to));
  const groups = navGroups(ctx)
    .map((g) => ({ ...g, items: g.items.filter((i) => !inTabs.has(i.to)) }))
    .filter((g) => g.items.length > 0);
  return (
    <div className="page narrow">
      <h1>More</h1>
      {groups.map((g) => (
        <section key={g.key} className="stack-sm">
          <h2 className="section-title">{g.title}</h2>
          <div className="more-list">
            {g.items.map((i) => (
              <Link key={i.to} to={i.to} className={`more-item sec-${i.section}`}>
                <span className="kpi-icon"><Icon name={i.icon} size={20} /></span>
                <span className="grow"><strong>{i.label}</strong><small className="muted">{i.hint}</small></span>
                <Icon name="chevron" />
              </Link>
            ))}
          </div>
        </section>
      ))}
      <section className="stack-sm">
        <h2 className="section-title">You</h2>
        <div className="more-list">
          <Link to="/account" className="more-item sec-home">
            <span className="kpi-icon"><Icon name="user" size={20} /></span>
            <span className="grow"><strong>Account</strong><small className="muted">{profile?.full_name ?? ''} · notifications, passkeys, theme, sign out</small></span>
            <Icon name="chevron" />
          </Link>
        </div>
      </section>
    </div>
  );
}
