import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useRealtime } from './useRealtime';
import type { ChecklistCheck, ChecklistItem, ChecklistTemplate } from './types';

export interface ChecklistProgress {
  template: ChecklistTemplate;
  items: ChecklistItem[];
  checks: Map<string, ChecklistCheck>; // by item_id
  done: number;
  total: number;
}

/** Active checklists with their items and the checks made on `date`. */
export function useChecklists(date: string) {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [checks, setChecks] = useState<ChecklistCheck[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [t, i, c] = await Promise.all([
      supabase.from('checklist_templates').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('checklist_items').select('*').eq('active', true).order('sort_order').order('created_at'),
      supabase.from('checklist_checks').select('*').eq('check_date', date),
    ]);
    setTemplates((t.data as ChecklistTemplate[]) ?? []);
    setItems((i.data as ChecklistItem[]) ?? []);
    setChecks((c.data as ChecklistCheck[]) ?? []);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['checklist_checks', 'checklist_templates', 'checklist_items'], load);

  const progress: ChecklistProgress[] = templates.map((template) => {
    const its = items.filter((i) => i.template_id === template.id);
    const map = new Map<string, ChecklistCheck>();
    for (const c of checks) if (c.template_id === template.id) map.set(c.item_id, c);
    const done = its.filter((i) => map.has(i.id)).length;
    return { template, items: its, checks: map, done, total: its.length };
  });

  return { progress, loading, reload: load, setChecks };
}
