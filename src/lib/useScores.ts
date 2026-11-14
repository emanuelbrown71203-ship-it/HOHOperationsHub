import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { useRealtime } from './useRealtime';
import { addDays, formatDay, weekStart } from './dates';
import type { HohLead, RatingRecord } from './types';

export type ScoreRange = '30d' | '90d' | 'all';
export const SCORE_RANGES: { key: ScoreRange; label: string; days: number | null }[] = [
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: 'all', label: 'All time', days: null },
];

/** A shift with a recorded Shift Lead (rated or not), for handoff completion. */
export interface LedShift {
  id: string;
  shift_date: string;
  shift: string;
  lead_id: string;
  lead_name: string | null;
  submitted_at: string | null;
}

export interface LeadStats {
  avg: number | null;
  count: number;
  dist: [number, number, number, number, number]; // counts of 1..5 stars
  prevAvg: number | null;
  delta: number | null;
  shiftsLed: number;
  submitted: number;
}

export interface WeekPoint {
  key: string;
  label: string;
  lead: number | null;
  leadCount: number;
  store: number | null;
  storeCount: number;
}

/** Everything the Lead Scores pages need, kept live. Ratings come back empty for people who can't see scores. */
export function useScores() {
  const [records, setRecords] = useState<RatingRecord[]>([]);
  const [shifts, setShifts] = useState<LedShift[]>([]);
  const [leads, setLeads] = useState<HohLead[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [r, s, l] = await Promise.all([
      supabase.from('lead_rating_history').select('*').order('shift_date', { ascending: false }).limit(5000),
      supabase.from('shift_handoffs').select('id,shift_date,shift,lead_id,lead_name,submitted_at').not('lead_id', 'is', null).limit(5000),
      supabase.from('hoh_leads').select('*').order('sort_order').order('name'),
    ]);
    setRecords(((r.data as RatingRecord[]) ?? []).map((x) => ({ ...x, rating: Number(x.rating), photo_count: Number(x.photo_count) })));
    setShifts((s.data as LedShift[]) ?? []);
    setLeads((l.data as HohLead[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['shift_ratings', 'shift_handoffs', 'hoh_leads'], load);

  return { records, shifts, leads, loading, reload: load };
}

export function rangeWindow(range: ScoreRange, today: string) {
  const days = SCORE_RANGES.find((r) => r.key === range)?.days ?? null;
  if (days === null) return { start: null as string | null, prevStart: null as string | null, prevEnd: null as string | null };
  const start = addDays(today, -(days - 1));
  return { start, prevStart: addDays(start, -days), prevEnd: addDays(start, -1) };
}

const inWindow = (date: string, start: string | null, end: string) => (!start || date >= start) && date <= end;
const average = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Stats for one lead (or the whole store when leadId is null). `current` is the shift still running, left out of completion. */
export function statsFor(
  leadId: string | null,
  records: RatingRecord[],
  shifts: LedShift[],
  range: ScoreRange,
  today: string,
  current: { date: string; shift: string },
): LeadStats {
  const { start, prevStart, prevEnd } = rangeWindow(range, today);
  const mine = (x: { lead_id: string | null }) => leadId === null || x.lead_id === leadId;
  const now = records.filter((r) => mine(r) && inWindow(r.shift_date, start, today));
  const prev = prevStart && prevEnd ? records.filter((r) => mine(r) && inWindow(r.shift_date, prevStart, prevEnd)) : [];
  const dist: LeadStats['dist'] = [0, 0, 0, 0, 0];
  for (const r of now) dist[r.rating - 1]++;
  const avg = average(now.map((r) => r.rating));
  const prevAvg = average(prev.map((r) => r.rating));
  const led = shifts.filter(
    (s) => mine(s) && inWindow(s.shift_date, start, today) && !(s.shift_date === current.date && s.shift === current.shift),
  );
  return {
    avg,
    count: now.length,
    dist,
    prevAvg,
    delta: avg !== null && prevAvg !== null ? avg - prevAvg : null,
    shiftsLed: led.length,
    submitted: led.filter((s) => s.submitted_at).length,
  };
}

/** Weekly average for a lead next to the store's weekly average. */
export function weeklySeries(leadId: string, records: RatingRecord[], range: ScoreRange, today: string): WeekPoint[] {
  const { start } = rangeWindow(range, today);
  const inRange = records.filter((r) => inWindow(r.shift_date, start, today));
  if (inRange.length === 0) return [];
  const first = start ?? inRange.reduce((m, r) => (r.shift_date < m ? r.shift_date : m), today);
  const weeks: WeekPoint[] = [];
  for (let w = weekStart(first); w <= today; w = addDays(w, 7)) {
    const end = addDays(w, 6);
    const all = inRange.filter((r) => r.shift_date >= w && r.shift_date <= end);
    const lead = all.filter((r) => r.lead_id === leadId);
    weeks.push({
      key: w,
      label: formatDay(w).replace(/^\w+, /, ''),
      lead: average(lead.map((r) => r.rating)),
      leadCount: lead.length,
      store: average(all.map((r) => r.rating)),
      storeCount: all.length,
    });
  }
  return weeks;
}

export function useScoreRange(params: URLSearchParams) {
  const raw = params.get('range');
  return useMemo<ScoreRange>(() => (raw === '90d' || raw === 'all' ? raw : '30d'), [raw]);
}

export const fmtAvg = (v: number | null) => (v === null ? '–' : v.toFixed(1));
export const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 100));
