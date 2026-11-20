import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { useRealtime } from './useRealtime';
import { addDays } from './dates';
import type { CleaningLog, CleaningTask } from './types';

export type CleanStatus = 'overdue' | 'due' | 'done' | 'later';

export interface CleanItem {
  task: CleaningTask;
  status: CleanStatus;
  /** Today's check-off, if done today. */
  today?: CleaningLog;
  /** The most recent check-off. */
  last?: CleaningLog;
  /** When it is next due (today for anything due or overdue). */
  dueOn: string;
  overdueDays: number;
}

export const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 864e5);

export function everyLabel(days: number) {
  if (days === 1) return 'Every day';
  if (days === 2) return 'Every other day';
  if (days === 7) return 'Every week';
  if (days === 14) return 'Every 2 weeks';
  if (days === 30) return 'Every month';
  if (days % 7 === 0) return `Every ${days / 7} weeks`;
  return `Every ${days} days`;
}

/** Does this job belong to that shift? ('Any' jobs belong to every shift.) */
export const onShift = (t: CleaningTask, shift: string) => t.shift === shift || t.shift === 'Any';

/** Cleaning jobs and what's due, kept live. */
export function useCleaning(today: string, includeHidden = false) {
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [logs, setLogs] = useState<CleaningLog[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    let q = supabase.from('cleaning_tasks').select('*');
    if (!includeHidden) q = q.eq('active', true);
    const [t, l] = await Promise.all([
      q.order('sort_order').order('name'),
      supabase.from('cleaning_logs').select('*').gte('done_on', addDays(today, -400)).order('done_on', { ascending: false }).limit(4000),
    ]);
    setTasks((t.data as CleaningTask[]) ?? []);
    setLogs((l.data as CleaningLog[]) ?? []);
    setLoading(false);
  }, [today, includeHidden]);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['cleaning_tasks', 'cleaning_logs'], load);

  const items = useMemo<CleanItem[]>(
    () =>
      tasks.filter((t) => t.active).map((task) => {
        const mine = logs.filter((l) => l.task_id === task.id && l.done_on <= today);
        const todayLog = mine.find((l) => l.done_on === today);
        const last = mine[0];
        if (todayLog) return { task, status: 'done', today: todayLog, last, dueOn: addDays(today, task.every_days), overdueDays: 0 };
        if (!last) return { task, status: 'due', last, dueOn: today, overdueDays: 0 };
        const next = addDays(last.done_on, task.every_days);
        if (next > today) return { task, status: 'later', last, dueOn: next, overdueDays: 0 };
        const late = dayDiff(next, today);
        // A daily job is simply due today; missing yesterday isn't something to act on now.
        return { task, status: late > 0 && task.every_days > 1 ? 'overdue' : 'due', last, dueOn: today, overdueDays: task.every_days > 1 ? late : 0 };
      }),
    [tasks, logs, today],
  );

  return { tasks, logs, items, loading, reload: load };
}

/** What's left today for a shift (or every shift when none given). */
export function leftToday(items: CleanItem[], shift?: string) {
  return items.filter((i) => (i.status === 'due' || i.status === 'overdue') && (!shift || onShift(i.task, shift)));
}
