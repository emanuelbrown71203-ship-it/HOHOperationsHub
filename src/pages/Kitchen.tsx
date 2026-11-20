import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { useRealtime } from '../lib/useRealtime';
import { timeAgo } from '../lib/dates';
import Icon from '../components/Icon';
import { useKitchenRequests } from './Notes';

function useWasteToday(today: string) {
  const [count, setCount] = useState<number | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from('waste_entries').select('id').eq('log_date', today);
    setCount((data ?? []).length);
  }, [today]);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['waste_entries'], load);
  return count;
}

/** The kitchen tools in one place, each showing what needs doing. */
export default function Kitchen() {
  const { today } = useApp();
  const { open } = useKitchenRequests();
  const waste = useWasteToday(today);
  const broken = open.filter((r) => r.kind === 'broken').length;
  const needed = open.length - broken;

  return (
    <div className="page narrow">
      <div className="page-title sec-notes">
        <span className="page-icon"><Icon name="wrench" size={22} /></span>
        <h1>Kitchen</h1>
      </div>
      <div className="post-buttons">
        <Link to="/notes?new=broken" className="post-btn kind-broken">
          <span className="quick-icon"><Icon name="wrench" size={22} /></span>
          <span><strong>Something’s broken</strong><small>Pass it along so it gets fixed</small></span>
        </Link>
        <Link to="/notes?new=need" className="post-btn kind-need">
          <span className="quick-icon"><Icon name="box" size={22} /></span>
          <span><strong>We need something</strong><small>Oven mitts, scrapers, supplies</small></span>
        </Link>
      </div>
      <div className="hub-list">
        <Link to="/notes" className={`hub-tile sec-notes ${open.length ? 'is-alert' : ''}`}>
          <span className="kpi-icon"><Icon name="wrench" size={22} /></span>
          <span className="grow">
            <strong>Equipment &amp; Supplies</strong>
            <small>{open.length ? `Latest: ${open[0].title}, ${timeAgo(open[0].created_at)}` : 'Everything broken or needed, until it’s taken care of'}</small>
          </span>
          <span className={`hub-status ${open.length ? 'bad' : 'ok'}`}>
            {open.length ? [broken && `${broken} broken`, needed && `${needed} needed`].filter(Boolean).join(' · ') : 'All clear'}
          </span>
        </Link>
        <Link to="/waste" className="hub-tile sec-waste">
          <span className="kpi-icon"><Icon name="trash" size={22} /></span>
          <span className="grow">
            <strong>Waste Log</strong>
            <small>Record food that was thrown away, and why</small>
          </span>
          <span className="hub-status">{waste === null ? '' : `${waste} today`}</span>
        </Link>
      </div>
    </div>
  );
}
