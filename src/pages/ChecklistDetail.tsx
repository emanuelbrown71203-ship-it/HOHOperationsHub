import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { useChecklists } from '../lib/useChecklists';
import { supabase, errorMessage } from '../lib/supabase';
import { formatDay, formatTime } from '../lib/dates';
import type { ChecklistCheck, ChecklistItem } from '../lib/types';
import Ring from '../components/Ring';
import DateNav from '../components/DateNav';
import Icon from '../components/Icon';
import { useConfirm } from '../components/Confirm';
import { PhotoPicker, PhotoThumb } from '../components/Photo';
import { removeFiles, uploadFile } from '../lib/files';

export default function ChecklistDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { today, ensureActor, actorLeadId, toast, session, isManager } = useApp();
  const date = params.get('date') || today;
  const { progress, loading, reload } = useChecklists(date);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const confirm = useConfirm();

  const p = progress.find((x) => x.template.id === id);

  /** Photo tasks: upload the picture, then check the task off with it attached. */
  async function checkWithPhoto(item: ChecklistItem, file: File) {
    if (busyItem || !ensureActor()) return;
    setBusyItem(item.id);
    try {
      const { path } = await uploadFile(`checklists/${p?.period ?? date}`, file);
      const { error } = await supabase.from('checklist_checks').insert({ template_id: item.template_id, item_id: item.id, check_date: p?.period ?? date, lead_id: actorLeadId, photo_path: path });
      if (error) {
        await removeFiles([path]);
        throw error;
      }
    } catch (e) {
      toast((e as { code?: string }).code === '23505' ? 'Already checked off' : errorMessage(e), 'error');
    }
    setBusyItem(null);
    reload();
  }

  async function toggle(item: ChecklistItem, check: ChecklistCheck | undefined) {
    if (busyItem) return;
    if (check) {
      const mine = check.user_id === session?.user.id;
      if (!mine && !isManager) {
        toast(`Only ${check.performed_by_name}'s account or a lead can uncheck this.`, 'error');
        return;
      }
      if (!(await confirm({ title: 'Uncheck this task?', body: `"${item.label}" was checked off by ${check.performed_by_name}.${check.photo_path ? ' Its photo is removed too.' : ''}`, confirmLabel: 'Uncheck' }))) return;
      setBusyItem(item.id);
      const { error } = await supabase.from('checklist_checks').delete().eq('id', check.id);
      setBusyItem(null);
      if (error) toast(errorMessage(error), 'error');
      else if (check.photo_path) removeFiles([check.photo_path]);
    } else {
      if (!ensureActor()) return;
      setBusyItem(item.id);
      const { error } = await supabase.from('checklist_checks').insert({
        template_id: item.template_id,
        item_id: item.id,
        check_date: p?.period ?? date,
        lead_id: actorLeadId,
      });
      setBusyItem(null);
      if (error) toast(error.code === '23505' ? 'Already checked off' : errorMessage(error), 'error');
    }
    reload();
  }

  if (loading) return <div className="page sec-checklists"><div className="spinner" /></div>;
  if (!p) {
    return (
      <div className="page sec-checklists">
        <Link to="/checklists" className="back-link"><Icon name="back" /> Checklists</Link>
        <div className="empty">This checklist was not found.</div>
      </div>
    );
  }

  const complete = p.total > 0 && p.done === p.total;

  return (
    <div className="page narrow sec-checklists">
      <Link to="/checklists" className="back-link"><Icon name="back" /> Checklists</Link>
      <div className="page-head">
        <h1>{p.template.name}</h1>
        <DateNav date={date} today={today} onChange={(d) => setParams({ date: d }, { replace: true })} />
      </div>

      <div className={`summary ${complete ? 'summary-done' : ''}`}>
        <Ring done={p.done} total={p.total} size={72} stroke={8} />
        <div>
          <span className="shift-tag">
            {p.template.shift === 'Any' ? 'Any shift' : `${p.template.shift} shift`}
            {p.template.frequency === 'weekly' && ` · Weekly (week of ${formatDay(p.period)})`}
          </span>
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
              <li key={item.id} className={item.requires_photo ? 'photo-task' : ''}>
                {item.requires_photo && !check ? (
                  <div className="check-row needs-photo">
                    <span className="checkbox"><Icon name="camera" size={16} /></span>
                    <span className="check-text">
                      <span className="check-label">{item.label}</span>
                      <span className="check-meta photo-note">Photo required</span>
                    </span>
                    <PhotoPicker multiple={false} busy={busyItem === item.id} onFiles={(f) => checkWithPhoto(item, f[0])} className="btn btn-primary btn-sm">Take photo</PhotoPicker>
                  </div>
                ) : (
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
                )}
                {check?.photo_path && <div className="check-photo"><PhotoThumb path={check.photo_path} label={item.label} /></div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
