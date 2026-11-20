import { useEffect, useState } from 'react';
import { refreshApp } from '../lib/refresh';
import Icon from './Icon';

/*
 * Pull down at the top of any screen to refresh, the same as in the owner's other apps (an app saved to the
 * home screen has no browser refresh button). It reloads every screen's data and, if a newer version of the
 * app is out, loads it. The browser's own pull is switched off in styles.css (overscroll-behavior).
 */
const PULL_THRESHOLD = 64;
const PULL_MAX = 110;
/** Pulls that start here are not refreshes: an open pop-up, a box being typed in, anything marked data-no-pull. */
const NOT_A_PULL = '.modal-backdrop, input, textarea, select, [contenteditable="true"], [data-no-pull]';
const pullDistance = (dy: number) => Math.max(0, Math.min(PULL_MAX, dy * 0.5));

type Phase = 'idle' | 'pulling' | 'ready' | 'refreshing' | 'updating' | 'done';
const LABEL: Record<Exclude<Phase, 'idle'>, string> = {
  pulling: 'Pull to refresh',
  ready: 'Let go to refresh',
  refreshing: 'Refreshing',
  updating: 'Getting the latest version',
  done: 'Up to date',
};

export default function PullToRefresh() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [pull, setPull] = useState(0);

  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let shown = 0;
    let busy = false;
    const show = (d: number) => {
      shown = d;
      setPull(d);
      setPhase(d === 0 ? 'idle' : d >= PULL_THRESHOLD ? 'ready' : 'pulling');
    };
    const begin = (e: TouchEvent) => {
      start = null;
      if (busy || e.touches.length !== 1 || window.scrollY > 0) return;
      if (e.target instanceof Element && e.target.closest(NOT_A_PULL)) return;
      if (document.querySelector('.modal-backdrop')) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const move = (e: TouchEvent) => {
      if (!start) return;
      const dy = e.touches[0].clientY - start.y;
      const dx = e.touches[0].clientX - start.x;
      // A sideways swipe or a scroll down the page is not a pull.
      if (dy < -8 || (Math.abs(dx) > 24 && Math.abs(dx) > dy) || window.scrollY > 0) {
        start = null;
        if (shown) show(0);
        return;
      }
      show(pullDistance(dy));
    };
    const end = async () => {
      if (!start) return;
      start = null;
      if (shown < PULL_THRESHOLD) {
        if (shown) show(0);
        return;
      }
      busy = true;
      shown = PULL_THRESHOLD;
      setPull(PULL_THRESHOLD);
      setPhase('refreshing');
      const result = await refreshApp();
      if (result === 'reload') return setPhase('updating');
      setPhase('done');
      setTimeout(() => {
        shown = 0;
        setPull(0);
        setPhase('idle');
        busy = false;
      }, 700);
    };
    window.addEventListener('touchstart', begin, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', end, { passive: true });
    window.addEventListener('touchcancel', end, { passive: true });
    return () => {
      window.removeEventListener('touchstart', begin);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  }, []);

  if (phase === 'idle') return null;
  const settling = phase === 'refreshing' || phase === 'updating' || phase === 'done';
  return (
    <div className={`pull ${phase} ${settling ? 'settling' : ''}`} style={{ transform: `translate(-50%, ${pull - 44}px)`, opacity: Math.min(1, pull / PULL_THRESHOLD + 0.2) }} role="status" aria-live="polite">
      <span className={`pull-circle ${phase === 'refreshing' || phase === 'updating' ? 'spinning' : ''}`}>
        <Icon name={phase === 'done' ? 'done' : settling ? 'refresh' : 'arrowDown'} size={15} />
      </span>
      <span>{LABEL[phase]}</span>
    </div>
  );
}
