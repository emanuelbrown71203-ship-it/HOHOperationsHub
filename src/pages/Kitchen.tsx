import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { useRealtime } from '../lib/useRealtime';
import { timeAgo } from '../lib/dates';
import Icon from '../components/Icon';
import { useFryers } from './Fryers';
import { useKitchenNotes } from './Notes';

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
  const { fryers, due, loading: loadingFryers } = useFryers(today);
  const { open, nameOf } = useKitchenNotes(today);
  const waste = useWasteToday(today);

  return (
    <div className="page narrow">
      <div className="page-title sec-fryers">
        <span className="page-icon"><Icon name="flame" size={22} /></span>
        <h1>Kitchen</h1>
      </div>
      <div className="hub-list">
        <Link to="/fryers" className={`hub-tile sec-fryers ${due.length ? 'is-alert' : ''}`}>
          <span className="kpi-icon"><Icon name="flame" size={22} /></span>
          <span className="grow">
            <strong>Fryer Tracker</strong>
            <small>Log when a fryer is filtered or gets new oil</small>
          </span>
          <span className={`hub-status ${due.length ? 'bad' : 'ok'}`}>
            {loadingFryers ? '' : fryers.length === 0 ? 'No fryers' : due.length ? `${due.length} due` : 'Up to date'}
          </span>
        </Link>
        <Link to="/notes" className={`hub-tile sec-notes ${open.length ? 'is-alert' : ''}`}>
          <span className="kpi-icon"><Icon name="wrench" size={22} /></span>
          <span className="grow">
            <strong>Equipment Issues</strong>
            <small>{open.length ? `Latest: ${nameOf(open[0].equipment_id)}, ${timeAgo(open[0].logged_at)}` : 'Report something broken'}</small>
          </span>
          <span className={`hub-status ${open.length ? 'bad' : 'ok'}`}>{open.length ? `${open.length} open` : 'All fixed'}</span>
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
      <Link to="/notes?new=1" className="btn btn-primary btn-block"><Icon name="plus" size={18} /> Report an equipment issue</Link>
    </div>
  );
}
