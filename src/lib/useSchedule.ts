import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { useRealtime } from './useRealtime';
import type { ScheduleEntry } from './types';

/** The Shift Lead schedule between two dates (inclusive), kept live. */
export function useSchedule(from: string, to: string) {
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const { data } = await supabase.from('shift_schedule').select('*').gte('shift_date', from).lte('shift_date', to).order('shift_date');
    setEntries((data as ScheduleEntry[]) ?? []);
    setLoading(false);
  }, [from, to]);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['shift_schedule'], load);
  const byKey = useMemo(() => new Map(entries.map((e) => [`${e.shift_date}|${e.shift}`, e])), [entries]);
  const entryFor = useCallback((date: string, shift: string) => byKey.get(`${date}|${shift}`), [byKey]);
  return { entries, entryFor, loading, reload: load };
}
