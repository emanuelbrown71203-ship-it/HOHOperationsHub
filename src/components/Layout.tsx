import iconUrl from '../assets/icon.svg';
import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../lib/app';
import { shiftTone } from '../lib/tone';
import LeadPicker from './LeadPicker';
import Icon from './Icon';
import { navGroups, tabItems } from '../lib/nav';
import { isDemo } from '../lib/supabase';
import { resetDemo } from '../lib/demo';
import PasskeyNudge from './PasskeyNudge';

export default function Layout({ children }: { children: ReactNode }) {
  const { isKitchen, actorName, shift, setShift, shiftNames, isAdmin, canSchedule, profile, settings, canViewScores } = useApp();
  const [pickerOpen, setPickerOpen] = useState(false);
  const needsLead = isKitchen && !actorName;

  const ctx = { isAdmin, canSchedule, canViewScores };
  const groups = navGroups(ctx);
  const tabs = tabItems(ctx);
  const { pathname } = useLocation();
  // Sub-pages light up the tab they belong to (fryers, waste and issues live under Kitchen).
  const KITCHEN = ['/kitchen', '/waste', '/notes'];
  const tabFor = (to: string) => (to === '/' ? pathname === '/' : to === '/kitchen' ? KITCHEN.includes(pathname) : pathname === to || pathname.startsWith(`${to}/`));
  const moreActive = !tabs.some((t) => tabFor(t.to));

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
        <NavLink to="/" end className="navlink sec-home">
          <Icon name="home" />
          <span>Home</span>
        </NavLink>
        {groups.map((g) => (
          <div key={g.key} className="nav-group" role="group" aria-label={g.title}>
            <span className="nav-group-title">{g.title}</span>
            {g.items.map((n) => (
              <NavLink key={n.to} to={n.to} className={`navlink sec-${n.section}`}>
                <Icon name={n.icon} />
                <span>{n.label}</span>
              </NavLink>
            ))}
          </div>
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
        {tabs.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={() => `tab sec-${n.section} ${tabFor(n.to) ? 'active' : ''}`}>
            <Icon name={n.icon} />
            <span>{n.short ?? n.label}</span>
          </NavLink>
        ))}
        <NavLink to="/more" className={() => `tab sec-setup ${moreActive ? 'active' : ''}`}>
          <Icon name="grid" />
          <span>More</span>
        </NavLink>
      </nav>

      {pickerOpen && <LeadPicker onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
