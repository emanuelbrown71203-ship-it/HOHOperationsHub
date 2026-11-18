import iconUrl from '../assets/icon.svg';
import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../lib/app';
import { shiftTone } from '../lib/tone';
import LeadPicker from './LeadPicker';
import Icon, { type IconName } from './Icon';
import { isDemo } from '../lib/supabase';
import { resetDemo } from '../lib/demo';
import PasskeyNudge from './PasskeyNudge';

type NavItem = { to: string; label: string; icon: IconName; section: string; adminOnly?: boolean; scoresOnly?: boolean };
const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: 'home', section: 'home' },
  { to: '/scores', label: 'Lead Scores', icon: 'trophy', section: 'scores', scoresOnly: true },
  { to: '/schedule', label: 'Lead Schedule', icon: 'calendar', section: 'schedule' },
  { to: '/checklists', label: 'Checklists', icon: 'check', section: 'checklists' },
  { to: '/handoff', label: 'Shift Handoff', icon: 'swap', section: 'handoff' },
  { to: '/fryers', label: 'Fryer Tracker', icon: 'flame', section: 'fryers' },
  { to: '/training', label: 'Who’s Trained', icon: 'users', section: 'training' },
  { to: '/waste', label: 'Waste Log', icon: 'trash', section: 'waste' },
  { to: '/notes', label: 'Equipment Issues', icon: 'wrench', section: 'notes' },
  { to: '/setup', label: 'Setup', icon: 'gear', section: 'setup', adminOnly: true },
];
// Phone tab bar: the daily screens, plus More (everything else, each with a line saying what it is).
const TABS: NavItem[] = [
  { to: '/', label: 'Home', icon: 'home', section: 'home' },
  { to: '/checklists', label: 'Checklists', icon: 'check', section: 'checklists' },
  { to: '/handoff', label: 'Handoff', icon: 'swap', section: 'handoff' },
  { to: '/schedule', label: 'Schedule', icon: 'calendar', section: 'schedule' },
  { to: '/more', label: 'More', icon: 'grid', section: 'setup' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { isKitchen, actorName, shift, setShift, shiftNames, isAdmin, profile, settings, canViewScores } = useApp();
  const [pickerOpen, setPickerOpen] = useState(false);
  const needsLead = isKitchen && !actorName;

  const nav = NAV.filter((n) => (!n.adminOnly || isAdmin) && (!n.scoresOnly || canViewScores));

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src={iconUrl} alt="" width={32} height={32} />
          <div>
            <div className="brand-name">HOH Operations Hub</div>
            <div className="brand-sub">{settings.store_name}</div>
          </div>
        </div>

        <div className="topbar-controls">
          <label className={`shift-select tone-${shiftTone(shiftNames, shift)}`}>
            <span className="sr-only">Shift</span>
            <span className="shift-dot" aria-hidden="true" />
            <select value={shift} onChange={(e) => setShift(e.target.value)} aria-label="Current shift">
              {(shiftNames.includes(shift) ? shiftNames : [shift, ...shiftNames]).map((s) => (
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
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={`navlink sec-${n.section}`}>
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
        <PasskeyNudge />
        {needsLead && (
          <button className="banner banner-warn" onClick={() => setPickerOpen(true)}>
            <Icon name="alert" />
            <span><strong>Who's the Shift Lead for the {shift} shift?</strong> Tap to choose. Entries will be logged under their name.</span>
          </button>
        )}
        {children}
      </main>

      <nav className="tabbar" aria-label="Main">
        {TABS.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={`tab sec-${n.section}`}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>

      {pickerOpen && <LeadPicker onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
