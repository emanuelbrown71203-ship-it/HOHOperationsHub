import { addDays } from './dates';

/** The shift that came right before `shift` on `date` (the first shift's previous shift is last night's). */
export function previousShift(date: string, shift: string, shiftNames: string[]): { date: string; shift: string } {
  const i = shiftNames.indexOf(shift);
  if (shiftNames.length === 0) return { date: addDays(date, -1), shift };
  if (i <= 0) return { date: addDays(date, -1), shift: shiftNames[shiftNames.length - 1] };
  return { date, shift: shiftNames[i - 1] };
}

/** Handoffs that need photos: every shift change and the close (that is, every shift). */
export const PHOTOS_REQUIRED = 1;
