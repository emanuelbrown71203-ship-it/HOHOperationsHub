import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useRealtime } from './useRealtime';
import { weekStart } from './dates';

export type BoardPeriod = 'week' | 'month';

export interface BoardRow {
  place: number;
  lead_id: string;
  name: string;
  points: number;
}

export interface MyPoints {
  points: number;
  on_board: boolean;
  to_board: number;
}

export const periodStart = (period: BoardPeriod, today: string) => (period === 'week' ? weekStart(today) : `${today.slice(0, 7)}-01`);

/** The top of the board (never last place), plus your own points privately when `withMine` is set. */
export function useLeaderboard(period: BoardPeriod, today: string, withMine: boolean) {
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [mine, setMine] = useState<MyPoints | null>(null);
  const [loading, setLoading] = useState(true);
  const from = periodStart(period, today);
  const load = useCallback(async () => {
    const [b, m] = await Promise.all([
      supabase.rpc('leaderboard', { p_from: from, p_to: today }),
      withMine ? supabase.rpc('my_points', { p_from: from, p_to: today }) : Promise.resolve({ data: null }),
    ]);
    setRows((b.data as BoardRow[]) ?? []);
    const me = (m.data as MyPoints[] | null)?.[0];
    setMine(me ?? null);
    setLoading(false);
  }, [from, today, withMine]);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['checklist_checks', 'shift_handoffs', 'shift_ratings', 'cleaning_logs', 'waste_entries'], load);
  return { rows, mine, loading };
}
