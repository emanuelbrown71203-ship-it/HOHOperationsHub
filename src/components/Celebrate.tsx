import { useEffect, useSyncExternalStore } from 'react';

/*
 * A little celebration for the moments that earn one (a shift's list cleared, all the day's cleaning done).
 * Confetti falls for a few seconds behind a card; tap anywhere to close. It can be switched off in Account,
 * and with "reduce motion" on the card shows without the confetti. Same as the owner's other apps.
 */
const KEY = 'hoh.celebrations';
const EVENT = 'hoh-celebrations-change';
const COLORS = ['#0ca678', '#3b5bdb', '#ffd43b', '#e63946', '#7048e8', '#0c8599', '#e67700'];

type Party = { title: string; body: string } | null;
let current: Party = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function celebrationsOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setCelebrations(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* per-device convenience only */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** For the Account switch. */
export function useCelebrations(): boolean {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener(EVENT, l);
      return () => window.removeEventListener(EVENT, l);
    },
    celebrationsOn,
    () => true,
  );
}

export function celebrate(title: string, body: string) {
  if (!celebrationsOn()) return;
  current = { title, body };
  emit();
}

const close = () => {
  current = null;
  emit();
};

// A fixed "random" spread so the pieces don't jump when the screen redraws.
const PIECES = Array.from({ length: 60 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 53) % 100) / 100,
  duration: 2.2 + ((i * 29) % 100) / 70,
  size: 7 + ((i * 17) % 7),
  color: COLORS[i % COLORS.length],
  spin: (i % 2 ? 1 : -1) * (360 + ((i * 71) % 360)),
  round: i % 3 === 0,
}));

export default function Celebrations() {
  const party = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => current,
    () => null,
  );
  useEffect(() => {
    if (!party) return;
    const timer = setTimeout(close, 4200);
    return () => clearTimeout(timer);
  }, [party]);
  if (!party) return null;
  return (
    <div role="status" className="party" onClick={close}>
      <div aria-hidden="true" className="confetti">
        {PIECES.map((p, i) => (
          <span key={i} style={{ left: `${p.left}%`, width: p.size, height: p.round ? p.size : p.size * 0.45, background: p.color, borderRadius: p.round ? '50%' : 2, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`, ['--spin' as string]: `${p.spin}deg` }} />
        ))}
      </div>
      <div className="party-card">
        <p aria-hidden="true" className="party-emoji">🎉</p>
        <h2>{party.title}</h2>
        <p>{party.body}</p>
        <small>Tap anywhere to close</small>
      </div>
    </div>
  );
}
