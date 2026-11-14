import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useRealtime } from './useRealtime';
import type { Position, PositionFile } from './types';

export function usePositions(includeHidden = false) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [files, setFiles] = useState<PositionFile[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    let q = supabase.from('positions').select('*');
    if (!includeHidden) q = q.eq('active', true);
    const [p, f] = await Promise.all([q.order('sort_order').order('name'), supabase.from('position_files').select('*').order('created_at')]);
    setPositions((p.data as Position[]) ?? []);
    setFiles((f.data as PositionFile[]) ?? []);
    setLoading(false);
  }, [includeHidden]);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['positions', 'position_files'], load);
  return { positions, files, loading, reload: load, filesFor: (id: string) => files.filter((f) => f.position_id === id) };
}
