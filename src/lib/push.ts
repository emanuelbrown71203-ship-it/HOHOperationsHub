import { supabase, isDemo } from './supabase';
import { thisDevice } from './passkeys';

/** Public half of the notification signing key (safe to share; the private half stays in the database). */
const VAPID_PUBLIC_KEY = 'BCJKe6nIo_1st9j1dL_reVtRuM_oVt6HDgOkeI_bKWHE40MeQF9mhbhvt0K_pQXF2jZhYVUqFlrjhj9uMWQK7w4';

export const pushSupported = () =>
  !isDemo && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** iPhones and iPads only allow notifications once the app is added to the Home Screen. */
export const needsHomeScreen = () => {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
};

function keyBytes(base64url: string) {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js'));
}

/** Whether this device is already set up for the signed-in person. */
export async function pushStatus(): Promise<'on' | 'off' | 'blocked' | 'unsupported'> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return 'off';
  const { data } = await supabase.from('push_subscriptions').select('id').eq('endpoint', sub.endpoint).maybeSingle();
  return data ? 'on' : 'off';
}

/** Must be called from a tap. Returns an error message, or null when it worked. */
export async function enablePush(): Promise<string | null> {
  if (!pushSupported()) return 'This browser can’t show notifications.';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'Notifications are blocked for this app. Allow them in your phone’s settings, then try again.';
  try {
    const reg = await registration();
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
    const j = sub.toJSON();
    const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: sub.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth, p_device: thisDevice() });
    return error ? error.message : null;
  } catch (e) {
    return (e as Error).message || 'Could not turn on notifications.';
  }
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

/** Calls the notify function; returns its data or a readable error. */
export async function notifyAction<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('notify', { body });
  if (!error) return { data: data as T, error: null };
  let message = error.message;
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx) message = (await ctx.json()).error ?? message;
  } catch {
    /* keep the generic message */
  }
  return { data: null, error: message };
}
