import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useApp, type ThemeChoice } from '../lib/app';
import { supabase, errorMessage, isDemo } from '../lib/supabase';
import { isPlaceholderEmail, passkeyErrorMessage, passkeysSupported, thisDevice, wasCancelled } from '../lib/passkeys';
import { useConfirm } from '../components/Confirm';
import { ROLE_LABELS } from '../lib/types';
import NotificationsCard from '../components/NotificationsCard';
import Icon from '../components/Icon';

const THEMES: { key: ThemeChoice; label: string; hint: string }[] = [
  { key: 'light', label: 'Light', hint: 'Bright, best in a lit kitchen' },
  { key: 'dark', label: 'Dark', hint: 'Easier on the eyes at night' },
  { key: 'auto', label: 'Match device', hint: 'Follows this device’s setting' },
];

export default function Account() {
  const { profile, session, refreshProfile, signOut, toast, isKitchen, theme, setTheme } = useApp();
  const confirm = useConfirm();

  // Someone with no email and no passkey would be locked out after signing out.
  async function safeSignOut() {
    if (passkeysSupported() && isPlaceholderEmail(session?.user.email)) {
      const { data } = await supabase.auth.passkey.list();
      if ((data?.length ?? 0) === 0) {
        const ok = await confirm({
          title: 'Save a passkey first?',
          body: 'You haven’t saved a passkey yet, so you won’t be able to sign back in on your own. You’d need a sign-in code from an admin.',
          confirmLabel: 'Sign out anyway',
          danger: true,
        });
        if (!ok) return;
      }
    }
    signOut();
  }
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
          <div className="muted small">{isPlaceholderEmail(session?.user.email) ? 'Signs in with a passkey' : session?.user.email}</div>
          <span className="pill pill-accent profile-role">{profile ? ROLE_LABELS[profile.role] : ''}</span>
          {profile?.is_admin && profile.role !== 'pending' && <span className="pill pill-admin profile-role">Admin</span>}
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

      <NotificationsCard />

      <PasskeysCard />

      {!isPlaceholderEmail(session?.user.email) && <PasswordForm />}

      <button className="btn btn-ghost btn-block" onClick={safeSignOut}>
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

interface PasskeyRow {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
}

function PasskeysCard() {
  const { session, toast } = useApp();
  const confirm = useConfirm();
  const [rows, setRows] = useState<PasskeyRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const placeholder = isPlaceholderEmail(session?.user.email);

  const load = useCallback(async () => {
    if (!passkeysSupported()) return;
    const { data, error } = await supabase.auth.passkey.list();
    if (error) setError(passkeyErrorMessage(error));
    setRows((data as PasskeyRow[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.registerPasskey();
    setBusy(false);
    if (error) {
      if (!wasCancelled(error)) setError(passkeyErrorMessage(error));
      return;
    }
    toast('Passkey saved');
    load();
  }

  async function remove(row: PasskeyRow) {
    const last = (rows?.length ?? 0) <= 1;
    if (last && placeholder) {
      return toast('This is your only way to sign in. Add another passkey before removing this one.', 'error');
    }
    if (!(await confirm({ title: 'Remove this passkey?', body: `${row.friendly_name ?? 'This passkey'} won’t be able to sign in to the app anymore.`, confirmLabel: 'Remove', danger: true }))) return;
    const { error } = await supabase.auth.passkey.delete({ passkeyId: row.id });
    if (error) return toast(passkeyErrorMessage(error), 'error');
    toast('Passkey removed');
    load();
  }

  if (isDemo) {
    return (
      <section className="card">
        <h2>Passkeys</h2>
        <p className="muted small">In the real app, everyone signs in with a passkey (Face ID, fingerprint or the device passcode). Passkeys can’t be saved in this demo.</p>
      </section>
    );
  }
  if (!passkeysSupported()) {
    return (
      <section className="card">
        <h2>Passkeys</h2>
        <p className="muted small">This browser can’t save passkeys. Open the app in Safari, Chrome or Edge to add one.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Passkeys</h2>
        <button className="btn btn-primary btn-sm" onClick={add} disabled={busy}>
          <Icon name="key" size={16} /> {busy ? 'Waiting…' : `Add on ${thisDevice()}`}
        </button>
      </div>
      <p className="muted small">Sign in with Face ID, your fingerprint or the device passcode. Passkeys saved to iCloud Keychain or Google Password Manager work on your other devices too.</p>
      {error && <p className="nudge-error">{error}</p>}
      {rows === null ? (
        <div className="spinner" />
      ) : rows.length === 0 ? (
        <p className="empty">No passkeys yet.</p>
      ) : (
        <ul className="passkey-list">
          {rows.map((row) => (
            <li key={row.id}>
              <span className="passkey-icon" aria-hidden="true"><Icon name="key" size={18} /></span>
              <div className="grow">
                <strong>{row.friendly_name ?? 'Passkey'}</strong>
                <div className="muted small">
                  Added {new Date(row.created_at).toLocaleDateString()}
                  {row.last_used_at ? ` · last used ${new Date(row.last_used_at).toLocaleDateString()}` : ''}
                </div>
              </div>
              <button className="icon-btn" onClick={() => remove(row)} aria-label={`Remove ${row.friendly_name ?? 'passkey'}`}>
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
