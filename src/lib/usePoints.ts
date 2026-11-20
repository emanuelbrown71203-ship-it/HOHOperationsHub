import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { useRealtime } from './useRealtime';
import { DEFAULT_SETTINGS, type PointValues } from './types';

/** What one shift got done, credited to its Shift Lead (from the database function lead_points_by_shift). */
export interface ShiftPoints {
  shift_date: string;
  shift: string;
  lead_id: string;
  lead_name: string;
  checklists: number;
  handoff: boolean;
  stars: number | null;
  cleaning: number;
  waste_photo: boolean;
}

export interface PointBreakdown {
  checklist: number;
  handoff: number;
  star: number;
  cleaning: number;
  waste_photo: number;
  total: number;
}

export const POINT_LABELS: Record<keyof PointValues, { label: string; each: string }> = {
  checklist: { label: 'Checklists', each: 'each daily HOH Lead checklist finished' },
  handoff: { label: 'Handoffs', each: 'handoff submitted' },
  star: { label: 'Stars', each: 'each star the next shift gives the setup' },
  cleaning: { label: 'Cleaning', each: 'each cleaning job checked off' },
  waste_photo: { label: 'Waste photos', each: 'photo of the night’s waste' },
};

export const withDefaults = (v?: Partial<PointValues> | null): PointValues => ({ ...DEFAULT_SETTINGS.point_values, ...(v ?? {}) });

export function pointsFor(r: ShiftPoints, v: PointValues): PointBreakdown {
  const b = {
    checklist: r.checklists * v.checklist,
    handoff: r.handoff ? v.handoff : 0,
    star: Math.round(Number(r.stars ?? 0) * v.star),
    cleaning: r.cleaning * v.cleaning,
    waste_photo: r.waste_photo ? v.waste_photo : 0,
  };
  return { ...b, total: b.checklist + b.handoff + b.star + b.cleaning + b.waste_photo };
}

export function addUp(rows: ShiftPoints[], v: PointValues): PointBreakdown & { shifts: number } {
  const sum: PointBreakdown = { checklist: 0, handoff: 0, star: 0, cleaning: 0, waste_photo: 0, total: 0 };
  for (const r of rows) {
    const p = pointsFor(r, v);
    (Object.keys(sum) as (keyof PointBreakdown)[]).forEach((k) => (sum[k] += p[k]));
  }
  return { ...sum, shifts: rows.length };
}

/** Each shift's points between two dates (empty for people who can't see scores), kept live. */
export function useLeadPoints(from: string, to: string) {
  const [rows, setRows] = useState<ShiftPoints[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('lead_points_by_shift', { p_from: from, p_to: to });
    setRows(((data as ShiftPoints[]) ?? []).map((r) => ({ ...r, stars: r.stars === null ? null : Number(r.stars) })));
    setLoading(false);
  }, [from, to]);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['checklist_checks', 'shift_handoffs', 'shift_ratings', 'cleaning_logs', 'waste_entries'], load);
  const byLead = useMemo(() => {
    const m = new Map<string, ShiftPoints[]>();
    for (const r of rows) m.set(r.lead_id, [...(m.get(r.lead_id) ?? []), r]);
    return m;
  }, [rows]);
  return { rows, byLead, loading, reload: load };
}
