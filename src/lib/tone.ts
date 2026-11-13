/** Each shift gets a time-of-day color theme, in the order shifts are listed in Setup → Store. */
export type Tone = 'sunrise' | 'day' | 'dusk' | 'night';
const TONES: Tone[] = ['sunrise', 'day', 'dusk', 'night'];

export function shiftTone(shiftNames: string[], shift: string): Tone {
  const i = shiftNames.indexOf(shift);
  return TONES[Math.min(i < 0 ? 0 : i, TONES.length - 1)];
}
