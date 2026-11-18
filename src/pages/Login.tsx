import iconUrl from '../assets/icon.svg';
import { useState, type FormEvent } from 'react';
import { supabase, errorMessage, isDemo } from '../lib/supabase';
import { DEMO_ACCOUNTS } from '../lib/demo';
import { accountAction, passkeyErrorMessage, passkeysSupported, setOffer, signInWithToken, wasCancelled } from '../lib/passkeys';
import Icon from '../components/Icon';

type Mode = 'start' | 'create' | 'code' | 'email' | 'forgot';

export default function Login() {
  const supported = passkeysSupported();
  const [mode, setMode] = useState<Mode>(supported ? 'start' : 'email');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const go = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  async function signInWithPasskey() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPasskey();
    setBusy(false);
    if (error && !wasCancelled(error)) setError(passkeyErrorMessage(error));
  }

  async function createAccount(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await accountAction<{ token_hash: string }>({ action: 'signup', name: name.trim() });
    if (error || !data) {
      setBusy(false);
      return setError(error ?? 'Could not create your account.');
    }
    setOffer(true); // the next screen asks them to save their passkey
    const { error: signInError } = await signInWithToken(data.token_hash);
    setBusy(false);
    if (signInError) setError(errorMessage(signInError));
  }

  async function useCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await accountAction<{ token_hash: string }>({ action: 'code-redeem', code });
    if (error || !data) {
      setBusy(false);
      return setError(error ?? 'That code didn’t work.');
    }
    setOffer(true);
    const { error: signInError } = await signInWithToken(data.token_hash);
    setBusy(false);
    if (signInError) setError(errorMessage(signInError));
  }

  async function emailSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (error) throw error;
        setNotice('If that email has an account, a reset link is on its way. Or ask an admin to set a temporary password for you.');
        setMode('email');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <img src={iconUrl} alt="" width={52} height={52} />
          <div>
            <span className="auth-eyebrow">Heart of House</span>
            <h1>HOH Operations Hub</h1>
          </div>
          <p>Shift checklists, handoffs and kitchen notes for the whole team.</p>
        </div>

        {isDemo ? (
          <div className="demo-accounts">
            <strong>Try the demo as…</strong>
            {DEMO_ACCOUNTS.map((a) => (
              <button
                type="button"
                key={a.email}
                className="demo-account"
                onClick={async () => {
                  const { error } = await supabase.auth.signInWithPassword({ email: a.email, password: 'demo' });
                  if (error) setError(errorMessage(error));
                }}
              >
                <span>{a.label}</span>
                <small>{a.hint}</small>
              </button>
            ))}
            <p className="muted small">This preview uses sample data that stays in your browser. Nothing is saved to the store's real database. The real app signs in with passkeys.</p>
          </div>
        ) : mode === 'start' ? (
          <div className="auth-actions">
            <button className="btn btn-primary btn-block btn-lg" onClick={signInWithPasskey} disabled={busy}>
              <Icon name="key" size={20} /> {busy ? 'Waiting for your passkey…' : 'Sign in with a passkey'}
            </button>
            <p className="muted small center">Use Face ID, your fingerprint or this device’s passcode. No email or password needed.</p>
            <div className="auth-divider"><span>New here?</span></div>
            <button className="btn btn-ghost btn-block" onClick={() => go('create')}>Create an account</button>
            <div className="auth-links">
              <button type="button" className="link-btn" onClick={() => go('code')}>I have a sign-in code</button>
              <button type="button" className="link-btn muted-link" onClick={() => go('email')}>Sign in with email instead</button>
            </div>
          </div>
        ) : mode === 'create' ? (
          <form className="auth-actions" onSubmit={createAccount}>
            <h2 className="auth-step">Create your account</h2>
            <label className="field">
              <span>Your name, as it should appear on logs</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoComplete="name" autoFocus />
            </label>
            <button className="btn btn-primary btn-block btn-lg" disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Continue'}
            </button>
            <p className="muted small">Next, you’ll save a passkey on this device. An admin approves new accounts before they can see store data.</p>
            <button type="button" className="link-btn" onClick={() => go('start')}>Back</button>
          </form>
        ) : mode === 'code' ? (
          <form className="auth-actions" onSubmit={useCode}>
            <h2 className="auth-step">Use a sign-in code</h2>
            <p className="muted small">An admin can make you a one-time code in Setup → People. Use it to set up a passkey on a new device.</p>
            <label className="field">
              <span>Sign-in code</span>
              <input
                className="code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                required
                autoFocus
              />
            </label>
            <button className="btn btn-primary btn-block btn-lg" disabled={busy || code.replace(/[^A-Za-z0-9]/g, '').length < 8}>
              {busy ? 'Checking…' : 'Continue'}
            </button>
            <button type="button" className="link-btn" onClick={() => go(supported ? 'start' : 'email')}>Back</button>
          </form>
        ) : (
          <form className="auth-actions" onSubmit={emailSubmit}>
            <h2 className="auth-step">{mode === 'forgot' ? 'Reset your password' : 'Sign in with email'}</h2>
            {!supported && <p className="muted small">This browser can’t use passkeys, so sign in with your email and password.</p>}
            <label className="field">
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </label>
            {mode === 'email' && (
              <label className="field">
                <span>Password</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
              </label>
            )}
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
            </button>
            <div className="auth-links">
              {mode === 'email' ? (
                <button type="button" className="link-btn" onClick={() => go('forgot')}>Forgot your password?</button>
              ) : (
                <button type="button" className="link-btn" onClick={() => go('email')}>Back to email sign-in</button>
              )}
              {supported ? (
                <button type="button" className="link-btn muted-link" onClick={() => go('start')}>Use a passkey instead</button>
              ) : (
                <button type="button" className="link-btn muted-link" onClick={() => go('code')}>I have a sign-in code</button>
              )}
            </div>
          </form>
        )}

        {error && <div className="form-error">{error}</div>}
        {notice && <div className="form-notice">{notice}</div>}
      </div>
    </div>
  );
}
