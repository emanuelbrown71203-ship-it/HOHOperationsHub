import iconUrl from '../assets/icon.svg';
import { useState, type FormEvent } from 'react';
import { supabase, errorMessage, isDemo } from '../lib/supabase';
import { DEMO_ACCOUNTS } from '../lib/demo';

export default function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice('Account created. Check your email for a confirmation link, then sign in.');
          setMode('signin');
        }
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <img src={iconUrl} alt="" width={56} height={56} />
        <h1>HOH Operations Hub</h1>
        <p className="muted">Heart of House checklists, waste and equipment logs</p>

        {isDemo && (
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
            <p className="muted small">This preview uses sample data that stays in your browser. Nothing is saved to the store's real database.</p>
          </div>
        )}

        {!isDemo && <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'on' : ''} onClick={() => setMode('signin')}>
            Sign in
          </button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>
            Create account
          </button>
        </div>}

        {!isDemo && (
          <>
        {mode === 'signup' && (
          <label className="field">
            <span>Your name (as it should appear on logs)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </label>

        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>

        {mode === 'signup' && (
          <p className="muted small">New accounts need a director's approval before they can see or log anything.</p>
        )}
          </>
        )}

        {error && <div className="form-error">{error}</div>}
        {notice && <div className="form-notice">{notice}</div>}
      </form>
    </div>
  );
}
