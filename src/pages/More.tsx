import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import Icon, { type IconName } from '../components/Icon';

export default function More() {
  const { isAdmin, canSchedule, profile, canViewScores } = useApp();
  const items: { to: string; label: string; hint: string; icon: IconName; section: string }[] = [
    ...(canViewScores ? [{ to: '/scores', label: 'Lead Scores', hint: 'Star ratings and performance for each HOH Lead', icon: 'trophy' as IconName, section: 'scores' }] : []),
    ...(canSchedule ? [{ to: '/report', label: 'Monthly Report', hint: 'One printable page: scores, handoffs, waste, equipment and training', icon: 'file' as IconName, section: 'scores' }] : []),
    { to: '/fryers', label: 'Fryer Tracker', hint: 'Log when each fryer is filtered or gets new oil, and see what is due', icon: 'flame', section: 'fryers' },
    { to: '/training', label: 'Who’s Trained', hint: 'Which team members are trained on each position', icon: 'users', section: 'training' },
    { to: '/waste', label: 'Waste Log', hint: 'Record food that was thrown away, and why', icon: 'trash', section: 'waste' },
    { to: '/notes', label: 'Equipment Issues', hint: 'Report something broken and see what is still waiting to be fixed', icon: 'wrench', section: 'notes' },
    ...(isAdmin ? [{ to: '/setup', label: 'Setup', hint: 'Team accounts, leads, checklists, positions, equipment, store settings', icon: 'gear' as IconName, section: 'setup' }] : []),
    { to: '/account', label: 'Account', hint: `${profile?.full_name ?? ''} · notifications, theme, sign out`, icon: 'user', section: 'home' },
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
