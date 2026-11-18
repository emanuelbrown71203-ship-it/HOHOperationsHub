import { supabase, isDemo } from './supabase';

/** Accounts created with a passkey get a placeholder address that is never shown or emailed. */
export const PASSKEY_EMAIL_DOMAIN = 'passkey.invalid';
export const isPlaceholderEmail = (email?: string | null) => !!email && email.toLowerCase().endsWith(`@${PASSKEY_EMAIL_DOMAIN}`);

export const passkeysSupported = () => !isDemo && typeof window !== 'undefined' && 'PublicKeyCredential' in window;

/** Set right before signing in on a new device, so the app offers to save a passkey here. */
export const OFFER_KEY = 'hoh.offerPasskey';
export function setOffer(on: boolean) {
  try {
    if (on) sessionStorage.setItem(OFFER_KEY, '1');
    else sessionStorage.removeItem(OFFER_KEY);
  } catch {
    /* storage unavailable */
  }
}
export function hasOffer() {
  try {
    return sessionStorage.getItem(OFFER_KEY) === '1';
  } catch {
    return false;
  }
}

type AnyError = { code?: string; error_code?: string; name?: string; message?: string; cause?: { name?: string; message?: string } } | null | undefined;

/** True when the person closed the passkey prompt themselves. */
export function wasCancelled(err: AnyError) {
  const names = [err?.name, err?.cause?.name, err?.code].join(' ');
  return /NotAllowedError|AbortError|ERROR_CEREMONY_ABORTED/.test(names) || /cancel|not allowed|timed out/i.test(err?.message ?? '');
}

/** A plain-language message for passkey errors. */
export function passkeyErrorMessage(err: AnyError): string {
  const code = err?.code ?? err?.error_code ?? '';
  switch (code) {
    case 'passkey_disabled':
      return 'Passkey sign-in isn’t switched on yet. An admin needs to turn it on in Supabase (Authentication → Passkeys).';
    case 'webauthn_credential_not_found':
      return 'That passkey isn’t set up for this app anymore. Ask an admin for a sign-in code.';
    case 'webauthn_challenge_expired':
    case 'webauthn_challenge_not_found':
      return 'That took too long. Please try again.';
    case 'webauthn_credential_exists':
      return 'This device already has a passkey for your account.';
    case 'too_many_passkeys':
      return 'You’ve saved the most passkeys allowed. Remove an old one in Account first.';
    case 'webauthn_verification_failed':
      return 'The passkey couldn’t be checked. Please try again.';
    case 'user_banned':
      return 'This account has been switched off. Ask an admin.';
    default:
      if (wasCancelled(err)) return 'Cancelled. Tap the button again when you’re ready.';
      return err?.message || 'Something went wrong with the passkey. Please try again.';
  }
}

/** Calls the account helper function; returns its data or a readable error. */
export async function accountAction<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('account', { body });
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

/** Exchanges a one-time token from the account helper for a signed-in session. */
export async function signInWithToken(tokenHash: string) {
  return supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
}

/** A short device label for messages ("this iPad"). */
export function thisDevice() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document)) return 'this iPad';
  if (/iPhone/.test(ua)) return 'this iPhone';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'this phone' : 'this tablet';
  return 'this device';
}
