import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { useChecklists } from '../lib/useChecklists';
import { supabase, errorMessage } from '../lib/supabase';
import { formatTime } from '../lib/dates';
import type { ChecklistCheck, ChecklistItem } from '../lib/types';
import Ring from '../components/Ring';
import DateNav from '../components/DateNav';
import Icon from '../components/Icon';

export default function ChecklistDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { today, ensureActor, actorLeadId, toast, session, isManager } = useApp();
  const date = params.get('date') || today;
  const { progress, loading, reload } = useChecklists(date);
  const [busyItem, setBusyItem] = useState<string | null>(null);

  const p = progress.find((x) => x.template.id === id);

  async function toggle(item: ChecklistItem, check: ChecklistCheck | undefined) {
    if (busyItem) return;
    if (check) {
      const mine = check.user_id === session?.user.id;
      if (!mine && !isManager) {
        toast(`Only ${check.performed_by_name}'s account or a lead can uncheck this.`, 'error');
        return;
      }
      if (!confirm(`Uncheck "${item.label}"?`)) return;
      setBusyItem(item.id);
      const { error } = await supabase.from('checklist_checks').delete().eq('id', check.id);
      setBusyItem(null);
      if (error) toast(errorMessage(error), 'error');
    } else {
      if (!ensureActor()) return;
      setBusyItem(item.id);
      const { error } = await supabase.from('checklist_checks').insert({
        template_id: item.template_id,
        item_id: item.id,
        check_date: date,
        lead_id: actorLeadId,
      });
      setBusyItem(null);
      if (error) toast(error.code === '23505' ? 'Already checked off' : errorMessage(error), 'error');
    }
    reload();
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (!p) {
    return (
      <div className="page">
        <Link to="/checklists" className="back-link"><Icon name="back" /> Checklists</Link>
        <div className="empty">This checklist was not found.</div>
      </div>
    );
  }

  const complete = p.total > 0 && p.done === p.total;

  return (
    <div className="page narrow">
      <Link to="/checklists" className="back-link"><Icon name="back" /> Checklists</Link>
      <div className="page-head">
        <h1>{p.template.name}</h1>
        <DateNav date={date} today={today} onChange={(d) => setParams({ date: d }, { replace: true })} />
      </div>

      <div className={`summary ${complete ? 'summary-done' : ''}`}>
        <Ring done={p.done} total={p.total} size={72} stroke={8} />
        <div>
          <span className="shift-tag">{p.template.shift === 'Any' ? 'Any shift' : `${p.template.shift} shift`}</span>
          <strong className="summary-title">{complete ? 'All done!' : `${p.done} of ${p.total} complete`}</strong>
          <span className="muted small">{date !== today ? 'Viewing a past day' : complete ? 'Nice work, team.' : 'Tap a task when it’s done.'}</span>
        </div>
      </div>

      {p.items.length === 0 ? (
        <div className="empty">This checklist has no items yet.</div>
      ) : (
        <ul className="checklist">
          {p.items.map((item) => {
            const check = p.checks.get(item.id);
            return (
              <li key={item.id}>
                <button
                  className={`check-row ${check ? 'checked' : ''}`}
                  onClick={() => toggle(item, check)}
                  disabled={busyItem === item.id}
                  aria-pressed={!!check}
                >
                  <span className="checkbox">{check && <Icon name="done" size={18} />}</span>
                  <span className="check-text">
                    <span className="check-label">{item.label}</span>
                    {check && (
                      <span className="check-meta">
                        {check.performed_by_name} · {formatTime(check.checked_at)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
