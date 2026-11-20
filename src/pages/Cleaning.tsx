import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorMessage } from '../lib/supabase';
import { formatDay, formatTime, timeAgo } from '../lib/dates';
import { removeFiles, uploadFile } from '../lib/files';
import { everyLabel, leftToday, onShift, useCleaning, type CleanItem } from '../lib/useCleaning';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import Fold from '../components/Fold';
import { PhotoThumb } from '../components/Photo';
import { useConfirm } from '../components/Confirm';
import { celebrate } from '../components/Celebrate';

const ALL = 'all';

export default function Cleaning() {
  const { today, shift, shiftNames, isAdmin, isManager, session, ensureActor, actorLeadId, toast } = useApp();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const { items, logs, loading, reload } = useCleaning(today);
  const scope = params.get('shift') ?? shift;
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<CleanItem | null>(null);
  const photoFor = useRef<CleanItem | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const inScope = (i: CleanItem) => scope === ALL || onShift(i.task, scope);
  const shown = items.filter(inScope);
  const overdue = shown.filter((i) => i.status === 'overdue').sort((a, b) => b.overdueDays - a.overdueDays);
  const due = shown.filter((i) => i.status === 'due');
  const done = shown.filter((i) => i.status === 'done').sort((a, b) => (b.today?.done_at ?? '').localeCompare(a.today?.done_at ?? ''));
  const later = shown.filter((i) => i.status === 'later').sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const left = overdue.length + due.length;
  const todayTotal = left + done.length;
  const areas = [...new Set(due.map((i) => i.task.area))];

  const setScope = (s: string) => {
    const next = new URLSearchParams(params);
    next.set('shift', s);
    setParams(next, { replace: true });
  };

  async function markDone(item: CleanItem, file?: File) {
    if (busy || !ensureActor()) return;
    if (item.task.requires_photo && !file) {
      photoFor.current = item;
      fileInput.current?.click();
      return;
    }
    setBusy(item.task.id);
    let photo_path: string | null = null;
    try {
      if (file) photo_path = (await uploadFile(`cleaning/${today}`, file)).path;
      const { data, error } = await supabase.from('cleaning_logs').insert({ task_id: item.task.id, done_on: today, shift, lead_id: actorLeadId, photo_path }).select().single();
      if (error) throw error;
      const logId = (data as { id: string }).id;
      toast(`Done: ${item.task.name}`, 'ok', {
        undo: async () => {
          await supabase.from('cleaning_logs').delete().eq('id', logId);
          if (photo_path) await removeFiles([photo_path]);
          reload();
        },
      });
      // The last job on this list: celebrate.
      const stillLeft = leftToday(items, scope === ALL ? undefined : scope).filter((i) => i.task.id !== item.task.id);
      if (stillLeft.length === 0) {
        celebrate(scope === ALL ? 'All of today’s cleaning is done' : `${scope} cleaning is done`, 'Every cleaning job due today is checked off. Nice work, team.');
      }
    } catch (e) {
      if (photo_path) await removeFiles([photo_path]);
      toast((e as { code?: string }).code === '23505' ? 'Already checked off today' : errorMessage(e), 'error');
    } finally {
      setBusy(null);
      reload();
    }
  }

  async function undoDone(item: CleanItem) {
    const log = item.today;
    if (!log || busy) return;
    const mine = log.user_id === session?.user.id;
    if (!mine && !isManager) return toast(`Only ${log.performed_by_name}'s account or a lead can uncheck this.`, 'error');
    if (!mine && !(await confirm({ title: 'Uncheck this job?', body: `“${item.task.name}” was checked off by ${log.performed_by_name}.`, confirmLabel: 'Uncheck' }))) return;
    setBusy(item.task.id);
    const { error } = await supabase.from('cleaning_logs').delete().eq('id', log.id);
    setBusy(null);
    if (error) return toast(errorMessage(error), 'error');
    if (mine) {
      toast(`Unchecked “${item.task.name}”`, 'ok', {
        undo: async () => {
          const { error: e } = await supabase.from('cleaning_logs').insert({ task_id: item.task.id, done_on: log.done_on, shift: log.shift, lead_id: actorLeadId, photo_path: log.photo_path });
          if (e) toast(errorMessage(e), 'error');
          reload();
        },
      });
    } else if (log.photo_path) await removeFiles([log.photo_path]);
    reload();
  }

  const row = (i: CleanItem) => (
    <CleanRow key={i.task.id} item={i} busy={busy === i.task.id} onCheck={() => (i.status === 'done' ? undoDone(i) : markDone(i))} onOpen={() => setOpen(i)} />
  );

  return (
    <div className="page sec-cleaning">
      <div className="page-head">
        <div className="page-title">
          <span className="page-icon"><Icon name="broom" size={22} /></span>
          <h1>Cleaning Hub</h1>
        </div>
        {isAdmin && <Link to="/setup?tab=cleaning" className="btn btn-ghost btn-sm"><Icon name="edit" size={16} /> Edit jobs</Link>}
      </div>

      <section className="clean-band">
        <div>
          <span className="clean-band-label">{scope === ALL ? 'Today, all shifts' : `Today · ${scope} shift`}</span>
          <strong className="clean-band-number">{loading ? '–' : left === 0 ? 'All clear' : `${left} left`}</strong>
          <span className="clean-band-sub">
            {loading ? '' : todayTotal === 0 ? 'Nothing due today.' : `${done.length} of ${todayTotal} done${overdue.length ? ` · ${overdue.length} overdue` : ''}`}
          </span>
        </div>
        <div className="clean-band-bar" aria-hidden="true"><span style={{ width: `${todayTotal ? (done.length / todayTotal) * 100 : 100}%` }} /></div>
      </section>

      <div className="segmented clean-scope" role="tablist" aria-label="Which shift">
        {[...shiftNames, ALL].map((s) => (
          <button key={s} role="tab" aria-selected={scope === s} className={scope === s ? 'on' : ''} onClick={() => setScope(s)}>
            {s === ALL ? 'Whole day' : `${s} shift`}
            {s === shift && <span className="scope-now">now</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="spinner" />
      ) : items.length === 0 ? (
        <div className="empty">
          No cleaning jobs yet. {isAdmin ? <Link to="/setup?tab=cleaning">Add them in Setup → Cleaning.</Link> : 'An admin adds them in Setup → Cleaning.'}
        </div>
      ) : (
        <>
          {overdue.length > 0 && (
            <section className="card clean-group is-overdue">
              <h2 className="clean-group-title"><span className="dot dot-danger" />Overdue</h2>
              <ul className="clean-list">{overdue.map(row)}</ul>
            </section>
          )}

          {areas.map((a) => (
            <section key={a} className="card clean-group">
              <h2 className="clean-group-title"><span className="dot" />{a}</h2>
              <ul className="clean-list">{due.filter((i) => i.task.area === a).map(row)}</ul>
            </section>
          ))}

          {left === 0 && <div className="all-clear big"><Icon name="done" size={20} /> All clear. Everything due {scope === ALL ? 'today' : `for the ${scope} shift`} is done.</div>}

          {done.length > 0 && (
            <Fold title={`Done today (${done.length})`} summary={`Last: ${done[0].task.name}, ${done[0].today?.performed_by_name}`}>
              <ul className="clean-list">{done.map(row)}</ul>
            </Fold>
          )}
          {later.length > 0 && (
            <Fold title={`Coming up (${later.length})`} summary={`Next: ${later[0].task.name}, ${formatDay(later[0].dueOn)}`}>
              <ul className="clean-list">{later.map(row)}</ul>
            </Fold>
          )}
        </>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          const item = photoFor.current;
          photoFor.current = null;
          if (f && item) markDone(item, f);
        }}
      />

      {open && (
        <CleanSheet
          item={items.find((i) => i.task.id === open.task.id) ?? open}
          history={logs.filter((l) => l.task_id === open.task.id).slice(0, 6)}
          busy={busy === open.task.id}
          onDone={(i) => markDone(i)}
          onUndo={(i) => undoDone(i)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function statusLine(i: CleanItem) {
  if (i.status === 'done') return <><Icon name="done" size={14} /> {i.today?.performed_by_name} · {i.today ? formatTime(i.today.done_at) : ''}</>;
  if (i.status === 'overdue') return <>{i.overdueDays} day{i.overdueDays === 1 ? '' : 's'} overdue{i.last ? ` · last done ${formatDay(i.last.done_on)}` : ''}</>;
  if (i.status === 'later') return <>Next: {formatDay(i.dueOn)}</>;
  return i.last ? <>Last done {formatDay(i.last.done_on)} by {i.last.performed_by_name}</> : <>Not done yet</>;
}

function CleanRow({ item: i, busy, onCheck, onOpen }: { item: CleanItem; busy: boolean; onCheck: () => void; onOpen: () => void }) {
  const done = i.status === 'done';
  return (
    <li className={`clean-row clean-${i.status}`}>
      <button
        className={`clean-check ${done ? 'on' : ''}`}
        onClick={onCheck}
        disabled={busy || i.status === 'later'}
        aria-label={done ? `Uncheck ${i.task.name}` : i.task.requires_photo ? `Take a photo to finish ${i.task.name}` : `Mark ${i.task.name} done`}
      >
        {busy ? <span className="mini-spinner" /> : <Icon name={done ? 'done' : i.task.requires_photo ? 'camera' : 'done'} size={20} />}
      </button>
      <button className="clean-text" onClick={onOpen}>
        <strong>{i.task.name}</strong>
        <small className="clean-meta">
          {everyLabel(i.task.every_days)} · {i.task.shift === 'Any' ? 'Any shift' : `${i.task.shift} shift`}
          {i.task.requires_photo && !done && <span className="photo-need"><Icon name="camera" size={12} /> Photo</span>}
        </small>
        <small className={`clean-status ${i.status}`}>{statusLine(i)}</small>
      </button>
    </li>
  );
}

function CleanSheet({ item: i, history, busy, onDone, onUndo, onClose }: { item: CleanItem; history: CleanItem['last'][]; busy: boolean; onDone: (i: CleanItem) => void; onUndo: (i: CleanItem) => void; onClose: () => void }) {
  return (
    <Modal title={i.task.name} onClose={onClose}>
      <div className="stack">
        <p className="muted">
          {i.task.area} · {everyLabel(i.task.every_days)} · {i.task.shift === 'Any' ? 'any shift' : `${i.task.shift} shift`}
          {i.task.requires_photo && ' · photo required'}
        </p>
        {i.task.instructions && <p className="clean-instructions">{i.task.instructions}</p>}
        <p className={`clean-status big ${i.status}`}>{statusLine(i)}</p>
        {i.status === 'done' ? (
          <button className="btn btn-ghost btn-block" onClick={() => onUndo(i)} disabled={busy}>Uncheck</button>
        ) : i.status !== 'later' ? (
          <button className="btn btn-primary btn-block" onClick={() => { onDone(i); onClose(); }} disabled={busy}>
            <Icon name={i.task.requires_photo ? 'camera' : 'done'} size={18} /> {i.task.requires_photo ? 'Take a photo and mark done' : 'Mark done'}
          </button>
        ) : null}
        <h3>Recent</h3>
        {history.length === 0 ? (
          <p className="muted small">Not done in the last year.</p>
        ) : (
          <ul className="clean-history">
            {history.map((h) => h && (
              <li key={h.id}>
                <span><strong>{formatDay(h.done_on)}</strong> · {h.performed_by_name}{h.shift ? ` · ${h.shift}` : ''} <span className="muted small">({timeAgo(h.done_at)})</span></span>
                {h.photo_path && <PhotoThumb path={h.photo_path} label={`${i.task.name}, ${formatDay(h.done_on)}`} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
