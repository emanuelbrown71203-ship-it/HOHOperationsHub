import { useState, type FormEvent } from 'react';
import { useApp } from '../lib/app';
import { supabase, errorMessage } from '../lib/supabase';
import { ROLE_LABELS } from '../lib/types';

export default function Account() {
  const { profile, session, refreshProfile, signOut, toast, isKitchen } = useApp();
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
      <h1>Account</h1>

      <section className="card">
        <dl className="details">
          <dt>Email</dt>
          <dd>{session?.user.email}</dd>
          <dt>Role</dt>
          <dd>{profile ? ROLE_LABELS[profile.role] : ''}</dd>
        </dl>
        {isKitchen && (
          <p className="muted small">
            This is the shared kitchen device account. Entries are credited to the Shift Lead chosen at the top of the screen.
          </p>
        )}
      </section>

      {!isKitchen && (
        <form className="card" onSubmit={save}>
          <h2>Your name</h2>
          <p className="muted small">This is the name attached to everything you log.</p>
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <button className="btn btn-primary" disabled={busy || name.trim() === profile?.full_name}>Save</button>
        </form>
      )}

      <button className="btn btn-ghost btn-block" onClick={() => signOut()}>
        Sign out
      </button>
    </div>
  );
}
