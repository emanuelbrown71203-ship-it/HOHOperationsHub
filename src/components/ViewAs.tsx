import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp, type Preview } from '../lib/app';
import type { Role } from '../lib/types';
import Icon from './Icon';

interface Option {
  key: string;
  role: Role;
  isAdmin: boolean;
  label: string;
  hint: string;
  needsLead?: boolean;
}

const OPTIONS: Option[] = [
  { key: 'kitchen', role: 'kitchen', isAdmin: false, label: 'Store tablet', hint: 'The shared kitchen device: picks a Shift Lead, sees the shift view.' },
  { key: 'lead', role: 'lead', isAdmin: false, label: 'HOH Lead', hint: 'A lead on their own phone: their shifts, their score if leads can see scores.', needsLead: true },
  { key: 'team', role: 'team_member', isAdmin: false, label: 'Team member', hint: 'Someone on the team with their own account.' },
  { key: 'director', role: 'director', isAdmin: false, label: 'Director (not an admin)', hint: 'Lead scores, schedule and coaching, but no Setup.' },
  { key: 'pending', role: 'pending', isAdmin: false, label: 'New sign-up', hint: 'The waiting screen before an admin approves them.' },
];

/** Account: look at the app the way another role sees it (admins only). */
export function ViewAsCard() {
  const { realIsAdmin, preview, startPreview, endPreview, leads } = useApp();
  const navigate = useNavigate();
  const [pick, setPick] = useState<string>(preview ? OPTIONS.find((o) => o.role === preview.role)?.key ?? 'team' : 'team');
  const [leadId, setLeadId] = useState<string>(preview?.leadId ?? leads[0]?.id ?? '');
  if (!realIsAdmin) return null;
  const option = OPTIONS.find((o) => o.key === pick)!;

  function start() {
    const lead = leads.find((l) => l.id === leadId);
    if (option.needsLead && !lead) return;
    const p: Preview = { role: option.role, isAdmin: option.isAdmin, leadId: option.needsLead ? lead!.id : null, label: option.needsLead ? `${lead!.name}, HOH Lead` : option.label.replace(' (not an admin)', '') };
    startPreview(p);
    navigate('/');
    window.scrollTo(0, 0);
  }

  return (
    <section className="card view-as" id="view-as">
      <h2><Icon name="users" size={18} /> View the app as…</h2>
      <p className="muted small">See exactly what someone else sees: their menu, their Home and what they can open. Logging is switched off while you look, so nothing gets saved under the wrong name.</p>
      <div className="radio-list" role="radiogroup" aria-label="Role to view as">
        {OPTIONS.map((o) => (
          <button key={o.key} type="button" role="radio" aria-checked={pick === o.key} className={`radio-option ${pick === o.key ? 'on' : ''}`} onClick={() => setPick(o.key)}>
            <span className="radio-dot" aria-hidden="true" />
            <span><strong>{o.label}</strong><small>{o.hint}</small></span>
          </button>
        ))}
      </div>
      {option.needsLead && (
        <label className="field">
          <span>Which HOH Lead?</span>
          {leads.length ? (
            <select value={leadId} onChange={(e) => setLeadId(e.target.value)}>
              {leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          ) : (
            <span className="muted small">Add HOH Leads in Setup first.</span>
          )}
        </label>
      )}
      <div className="row-gap wrap">
        <button className="btn btn-primary" onClick={start} disabled={option.needsLead && !leads.length}>
          <Icon name="users" size={18} /> {preview ? 'Switch to this view' : 'Start viewing'}
        </button>
        {preview && <button className="btn btn-ghost" onClick={endPreview}>Back to my own view</button>}
      </div>
    </section>
  );
}

/** Shown on every screen while previewing. */
export function PreviewBanner({ noSwitch = false }: { noSwitch?: boolean }) {
  const { preview, endPreview } = useApp();
  if (!preview) return null;
  return (
    <div className="preview-banner" role="status">
      <Icon name="users" size={18} />
      <span className="grow"><strong>Viewing as {preview.label}</strong><small>Logging is off while you look around.</small></span>
      {!noSwitch && <Link to="/account" className="btn btn-sm btn-on-dark">Switch</Link>}
      <button className="btn btn-sm btn-on-dark solid" onClick={endPreview}>Exit</button>
    </div>
  );
}
