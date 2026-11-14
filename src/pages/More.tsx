import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import Icon, { type IconName } from '../components/Icon';

export default function More() {
  const { isManager, profile } = useApp();
  const items: { to: string; label: string; hint: string; icon: IconName; section: string }[] = [
    { to: '/waste', label: 'Waste log', hint: 'Log and review food waste', icon: 'trash', section: 'waste' },
    ...(isManager ? [{ to: '/setup', label: 'Setup', hint: 'Leads, checklists, positions, equipment, store settings', icon: 'gear' as IconName, section: 'setup' }] : []),
    { to: '/account', label: 'Account', hint: `${profile?.full_name ?? ''} · theme, password, sign out`, icon: 'user', section: 'home' },
  ];
  return (
    <div className="page narrow">
      <h1>More</h1>
      <div className="more-list">
        {items.map((i) => (
          <Link key={i.to} to={i.to} className={`more-item sec-${i.section}`}>
            <span className="kpi-icon"><Icon name={i.icon} size={20} /></span>
            <span className="grow"><strong>{i.label}</strong><small className="muted">{i.hint}</small></span>
            <Icon name="chevron" />
          </Link>
        ))}
      </div>
    </div>
  );
}
