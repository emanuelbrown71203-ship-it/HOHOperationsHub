import { useState, type FormEvent } from 'react';
import { useApp, type ThemeChoice } from '../lib/app';
import { supabase, errorMessage, isDemo } from '../lib/supabase';
import { ROLE_LABELS } from '../lib/types';
import Icon from '../components/Icon';

const THEMES: { key: ThemeChoice; label: string; hint: string }[] = [
  { key: 'light', label: 'Light', hint: 'Bright, best in a lit kitchen' },
  { key: 'dark', label: 'Dark', hint: 'Easier on the eyes at night' },
  { key: 'auto', label: 'Match device', hint: 'Follows this device’s setting' },
];

export default function Account() {
  const { profile, session, refreshProfile, signOut, toast, isKitchen, theme, setTheme } = useApp();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', profile.id);
    setBusy(false);
    if (error) return toast(errorMessage(error), 'error');
    await refreshProfile();
    toast('Name updated');
  }

  return (
    <div className="page narrow">
      <div className="page-title">
        <span className="page-icon"><Icon name="user" size={22} /></span>
        <h1>Account</h1>
      </div>

      <section className="card profile-card">
        <span className="avatar avatar-lg" aria-hidden="true">{(profile?.full_name || '?').slice(0, 1).toUpperCase()}</span>
        <div>
          <strong className="profile-name">{profile?.full_name}</strong>
          <div className="muted small">{session?.user.email}</div>
          <span className="pill pill-accent profile-role">{profile ? ROLE_LABELS[profile.role] : ''}</span>
        </div>
      </section>
      {isKitchen && (
        <p className="muted small">
          This is the shared kitchen device account. Entries are credited to the Shift Lead chosen at the top of the screen.
        </p>
      )}

      <section className="card">
        <h2>Display</h2>
        <p className="muted small">Saved on this device only.</p>
        <div className="theme-grid" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button key={t.key} role="radio" aria-checked={theme === t.key} className={`theme-option theme-${t.key} ${theme === t.key ? 'on' : ''}`} onClick={() => setTheme(t.key)}>
              <span className="theme-swatch" aria-hidden="true" />
              <strong>{t.label}</strong>
              <small>{t.hint}</small>
            </button>
          ))}
        </div>
      </section>

      {!isKitchen && (
        <form className="card" onSubmit={save}>
          <h2>Your name</h2>
          <p className="muted small">This is the name attached to everything you log.</p>
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <button className="btn btn-primary" disabled={busy || name.trim() === profile?.full_name}>Save name</button>
        </form>
      )}

      <PasswordForm />

      <button className="btn btn-ghost btn-block" onClick={() => signOut()}>
        <Icon name="logout" size={18} /> Sign out
      </button>
    </div>
  );
}

export function PasswordForm({ onDone, title = 'Change password' }: { onDone?: () => void; title?: string }) {
  const { toast } = useApp();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 6) return toast('Use at least 6 characters', 'error');
    if (pw !== pw2) return toast("The passwords don't match", 'error');
    if (isDemo) return toast('Passwords can’t be changed in the demo', 'error');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast(errorMessage(error), 'error');
    toast('Password updated');
    setPw('');
    setPw2('');
    onDone?.();
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>{title}</h2>
      <div className="field-row">
        <label className="field">
          <span>New password</span>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} autoComplete="new-password" required />
        </label>
        <label className="field">
          <span>Type it again</span>
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={6} autoComplete="new-password" required />
        </label>
      </div>
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
    </form>
  );
}
