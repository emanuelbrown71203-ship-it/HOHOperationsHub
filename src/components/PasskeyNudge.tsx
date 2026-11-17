import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { hasOffer, isPlaceholderEmail, passkeyErrorMessage, passkeysSupported, setOffer, thisDevice, wasCancelled } from '../lib/passkeys';
import Icon from './Icon';

/**
 * Asks the person to save a passkey right after they create an account or use a sign-in code.
 * Saving it is a separate tap on purpose: iPads and iPhones only allow passkey creation from a tap.
 */
export default function PasskeyNudge() {
  const { session, toast } = useApp();
  const [state, setState] = useState<'checking' | 'needed' | 'offer' | 'hidden'>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const placeholder = isPlaceholderEmail(session?.user.email);

  const check = useCallback(async () => {
    if (!passkeysSupported() || !session) return setState('hidden');
    const { data } = await supabase.auth.passkey.list();
    const count = data?.length ?? 0;
    if (count === 0 && placeholder) setState('needed');
    else if (hasOffer()) setState('offer');
    else setState('hidden');
  }, [session, placeholder]);

  useEffect(() => {
    check();
  }, [check]);

  async function save() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.registerPasskey();
    setBusy(false);
    if (error) {
      if (!wasCancelled(error)) setError(passkeyErrorMessage(error));
      return;
    }
    setOffer(false);
    setState('hidden');
    toast('Passkey saved. Next time, tap “Sign in with a passkey”.');
  }

  if (state === 'checking' || state === 'hidden') return null;

  return (
    <section className="passkey-nudge" aria-live="polite">
      <span className="nudge-icon" aria-hidden="true"><Icon name="key" size={24} /></span>
      <div className="nudge-body">
        <strong>{state === 'needed' ? 'Save your passkey to finish' : `Save a passkey on ${thisDevice()}?`}</strong>
        <p>
          {state === 'needed'
            ? `Your account signs in with a passkey instead of a password. Save one on ${thisDevice()} with Face ID, your fingerprint or the passcode, or you won't be able to sign back in.`
            : 'Then you can sign in here with Face ID, your fingerprint or the passcode, without a code.'}
        </p>
        {error && <p className="nudge-error">{error}</p>}
      </div>
      <div className="nudge-actions">
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          <Icon name="key" size={18} /> {busy ? 'Waiting…' : 'Save passkey'}
        </button>
        {state === 'offer' && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setOffer(false);
              setState('hidden');
            }}
          >
            Not now
          </button>
        )}
      </div>
    </section>
  );
}
