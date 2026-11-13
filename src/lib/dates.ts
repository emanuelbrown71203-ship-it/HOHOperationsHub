import type { ShiftDef } from './types';

/** YYYY-MM-DD in the device's local time zone. */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + days));
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** The shift that is running now, from the store's shift start times (set in Setup → Store). */
export function shiftForTime(shifts: ShiftDef[], d: Date = new Date()): string {
  if (shifts.length === 0) return 'All day';
  const sorted = [...shifts].sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
  const now = d.getHours() * 60 + d.getMinutes();
  let current = sorted[sorted.length - 1]; // before the first start, the last shift (overnight) is still running
  for (const s of sorted) if (minutesOf(s.start) <= now) current = s;
  return current.name;
}

/** Monday of the week containing `date` (weekly checklists are stored on this day). */
export function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay(); // 0 = Sunday
  return addDays(date, day === 0 ? -6 : 1 - day);
}

export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h || 0, m || 0).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function hoursUntil(iso: string, hours: number): number {
  return (new Date(iso).getTime() + hours * 3600000 - Date.now()) / 3600000;
}

export function formatHours(h: number): string {
  const abs = Math.abs(h);
  if (abs < 1) return `${Math.max(1, Math.round(abs * 60))} min`;
  if (abs < 48) return `${Math.round(abs)} hr${Math.round(abs) === 1 ? '' : 's'}`;
  return `${Math.round(abs / 24)} days`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
