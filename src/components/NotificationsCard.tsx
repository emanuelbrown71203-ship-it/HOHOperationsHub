import { useEffect, useState } from 'react';
import { useApp } from '../lib/app';
import { disablePush, enablePush, needsHomeScreen, notifyAction, pushStatus, pushSupported } from '../lib/push';
import { thisDevice } from '../lib/passkeys';
import Icon from './Icon';

/** Lets a person turn phone notifications on for this device (Account page). */
export default function NotificationsCard() {
  const { settings, myLeadId, isKitchen, toast } = useApp();
  const [status, setStatus] = useState<'checking' | 'on' | 'off' | 'blocked' | 'unsupported'>('checking');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    pushStatus().then(setStatus).catch(() => setStatus('unsupported'));
  }, []);
  if (isKitchen) return null;

  async function turnOn() {
    setBusy(true);
    const error = await enablePush();
    setBusy(false);
    if (error) return toast(error, 'error');
    setStatus('on');
    toast('Notifications are on for this device');
  }
  async function turnOff() {
    setBusy(true);
    await disablePush();
    setBusy(false);
    setStatus('off');
  }
  async function test() {
    setBusy(true);
    const { error } = await notifyAction({ action: 'test' });
    setBusy(false);
    toast(error ?? 'Test sent. It should pop up in a few seconds.', error ? 'error' : 'ok');
  }

  const homeScreen = pushSupported() ? false : needsHomeScreenSafe();
  return (
    <section className="card">
      <h2><Icon name="bell" size={18} /> Notifications</h2>
      <p className="muted small">
        Get a notification on {thisDevice()} when you’re put on the Shift Lead schedule, and a reminder an hour before your shift. You only hear about your own shifts.
      </p>
      {!settings.notifications_enabled && <p className="banner banner-info">Notifications are switched off for the store right now. An admin can turn them on in Setup → Store. You can still set this device up so it’s ready.</p>}
      {!myLeadId && <p className="muted small">Your account isn’t linked to a name on the HOH Leads list yet, so the schedule can’t reach you. An admin links it in Setup → HOH Leads.</p>}
      {status === 'checking' ? null : status === 'on' ? (
        <div className="row-gap wrap">
          <span className="pill pill-ok"><Icon name="done" size={12} /> On for this device</span>
          <button className="btn btn-ghost btn-sm" onClick={test} disabled={busy}>Send a test</button>
          <button className="btn btn-ghost btn-sm" onClick={turnOff} disabled={busy}>Turn off</button>
        </div>
      ) : status === 'blocked' ? (
        <p className="form-error">Notifications are blocked for this app on this device. Allow them in the device’s settings for this site, then come back.</p>
      ) : status === 'unsupported' ? (
        <p className="muted small">
          {homeScreen
            ? 'On an iPhone or iPad, first add this app to your Home Screen: tap the Share button in Safari, then “Add to Home Screen”. Open it from the new icon and come back to this page.'
            : 'This browser can’t show notifications. On an iPhone or iPad, add the app to your Home Screen first (Share → Add to Home Screen) and open it from there.'}
        </p>
      ) : (
        <button className="btn btn-primary" onClick={turnOn} disabled={busy}><Icon name="bell" size={18} /> {busy ? 'Turning on…' : 'Turn on notifications'}</button>
      )}
    </section>
  );
}

function needsHomeScreenSafe() {
  try {
    return needsHomeScreen();
  } catch {
    return false;
  }
}
