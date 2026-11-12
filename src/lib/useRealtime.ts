import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

let channelCounter = 0;

/**
 * Calls `onChange` whenever any of the given tables change (from any device),
 * and when the app comes back to the foreground (e.g. a tablet waking up).
 */
export function useRealtime(tables: string[], onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = tables.join(',');

  useEffect(() => {
    if (!key) return;
    const channel = supabase.channel(`rt-${key}-${++channelCounter}`);
    for (const table of key.split(',')) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => cb.current());
    }
    channel.subscribe();

    const onVisible = () => {
      if (document.visibilityState === 'visible') cb.current();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [key]);
}
