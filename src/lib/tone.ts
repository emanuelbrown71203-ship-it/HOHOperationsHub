/** Each shift gets a time-of-day color theme: the first shift is a sunrise, the last is dusk. */
export type Tone = 'sunrise' | 'day' | 'dusk' | 'night';

export function shiftTone(shiftNames: string[], shift: string): Tone {
  const i = Math.max(0, shiftNames.indexOf(shift));
  const n = shiftNames.length;
  if (n <= 1) return 'day';
  if (i === 0) return 'sunrise';
  if (i === n - 1) return 'dusk';
  return i === 1 ? 'day' : 'night';
}
