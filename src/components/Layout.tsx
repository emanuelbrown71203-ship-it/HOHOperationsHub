import iconUrl from '../assets/icon.svg';
import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../lib/app';
import { SHIFTS, type Shift } from '../lib/types';
import LeadPicker from './LeadPicker';
import Icon, { type IconName } from './Icon';
import { isDemo } from '../lib/supabase';
import { resetDemo } from '../lib/demo';

const NAV: { to: string; label: string; icon: IconName; managerOnly?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/checklists', label: 'Checklists', icon: 'check' },
  { to: '/waste', label: 'Waste', icon: 'trash' },
  { to: '/equipment', label: 'Equipment', icon: 'wrench' },
  { to: '/setup', label: 'Setup', icon: 'gear', managerOnly: true },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { isKitchen, actorName, shift, setShift, isManager, profile } = useApp();
  const [pickerOpen, setPickerOpen] = useState(false);
  const needsLead = isKitchen && !actorName;

  const nav = NAV.filter((n) => !n.managerOnly || isManager);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src={iconUrl} alt="" width={32} height={32} />
          <div>
            <div className="brand-name">HOH Operations Hub</div>
            <div className="brand-sub">Heart of House</div>
          </div>
        </div>

        <div className="topbar-controls">
          <label className="shift-select">
            <span className="sr-only">Shift</span>
            <select value={shift} onChange={(e) => setShift(e.target.value as Shift)} aria-label="Current shift">
              {SHIFTS.map((s) => (
                <option key={s} value={s}>{s} shift</option>
              ))}
            </select>
          </label>

          {isKitchen ? (
            <button className={`lead-chip ${needsLead ? 'lead-chip-warn' : ''}`} onClick={() => setPickerOpen(true)}>
              <Icon name="user" />
              <span>
                <small>Shift Lead</small>
                {actorName ?? 'Tap to select'}
              </span>
            </button>
          ) : (
            <NavLink to="/account" className="lead-chip">
              <Icon name="user" />
              <span>
                <small>Logging as</small>
                {profile?.full_name}
              </span>
            </NavLink>
          )}
        </div>
      </header>

      <nav className="sidenav" aria-label="Main">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className="navlink">
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </NavLink>
        ))}
        <NavLink to="/account" className="navlink navlink-account">
          <Icon name="user" />
          <span>Account</span>
        </NavLink>
      </nav>

      <main className="content">
        {isDemo && (
          <div className="banner banner-demo">
            <span><strong>Demo with sample data.</strong> Changes stay in this browser only.</span>
            <button className="btn btn-ghost btn-sm" onClick={resetDemo}>Reset demo</button>
          </div>
        )}
        {needsLead && (
          <button className="banner banner-warn" onClick={() => setPickerOpen(true)}>
            <Icon name="alert" />
            <span><strong>Who's the Shift Lead for the {shift} shift?</strong> Tap to choose. Entries will be logged under their name.</span>
          </button>
        )}
        {children}
      </main>

      <nav className="tabbar" aria-label="Main">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className="tab">
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>

      {pickerOpen && <LeadPicker onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
