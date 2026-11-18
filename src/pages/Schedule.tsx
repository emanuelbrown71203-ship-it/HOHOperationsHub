import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorMessage } from '../lib/supabase';
import { addDays, formatDay, weekStart } from '../lib/dates';
import { useSchedule } from '../lib/useSchedule';
import { notifyAction } from '../lib/push';
import { shiftTone } from '../lib/tone';
import Icon from '../components/Icon';
import Modal from '../components/Modal';

const ADD = '__add__';

export default function Schedule() {
  const { today, shift, shiftNames, leads, canSchedule, isAdmin, myLeadId, settings, toast } = useApp();
  const [week, setWeek] = useState(() => weekStart(today));
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const end = days[6];
  const { entries, entryFor, loading, reload } = useSchedule(addDays(week, -7), end);
  const [adding, setAdding] = useState<{ date: string; shift: string } | null>(null);
  const [sending, setSending] = useState(false);

  const nameOf = (id: string) => leads.find((l) => l.id === id)?.name ?? 'Removed lead';
  const thisWeek = entries.filter((e) => e.shift_date >= week);
  const upcoming = thisWeek.filter((e) => e.shift_date >= today);
  const unsent = upcoming.filter((e) => !e.notified_at);
  const counts = new Map<string, number>();
  for (const e of thisWeek) counts.set(e.lead_id, (counts.get(e.lead_id) ?? 0) + 1);
  const noAccount = [...counts.keys()].filter((id) => !leads.find((l) => l.id === id)?.profile_id);

  async function setLead(date: string, s: string, leadId: string) {
    const { error } = leadId
      ? await supabase.from('shift_schedule').upsert({ shift_date: date, shift: s, lead_id: leadId }, { onConflict: 'shift_date,shift' })
      : await supabase.from('shift_schedule').delete().eq('shift_date', date).eq('shift', s);
    if (error) toast(errorMessage(error), 'error');
    reload();
  }

  async function copyLastWeek() {
    const rows = days.flatMap((d) =>
      shiftNames
        .filter((s) => !entryFor(d, s))
        .map((s) => ({ shift_date: d, shift: s, lead_id: entryFor(addDays(d, -7), s)?.lead_id }))
        .filter((r) => r.lead_id && leads.some((l) => l.id === r.lead_id)),
    );
    if (rows.length === 0) return toast('Nothing to copy: last week is empty, or this week is already filled in', 'error');
    const { error } = await supabase.from('shift_schedule').insert(rows);
    if (error) toast(errorMessage(error), 'error');
    else toast(`Copied ${rows.length} shift${rows.length === 1 ? '' : 's'} from last week`);
    reload();
  }

  async function send() {
    setSending(true);
    const { data, error } = await notifyAction<{ shifts: number; notified: string[]; notReached: string[] }>({ action: 'schedule-posted', from: week, to: end });
    setSending(false);
    if (error || !data) return toast(error ?? 'Could not send the schedule', 'error');
    reload();
    if (data.shifts === 0) return toast('Everyone on this week has already been told');
    const parts = [];
    if (data.notified.length) parts.push(`Notified ${data.notified.join(', ')}`);
    if (data.notReached.length) parts.push(`${data.notReached.join(', ')} ${data.notReached.length === 1 ? 'has' : 'have'} no phone set up, so tell them in person`);
    toast(parts.join('. ') + '.', data.notified.length ? 'ok' : 'error');
  }

  return (
    <div className="page sec-schedule">
      <div className="page-head">
        <div className="page-title">
          <span className="page-icon"><Icon name="calendar" size={22} /></span>
          <h1>Shift Lead Schedule</h1>
        </div>
        <div className="week-nav">
          <button className="icon-btn" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week"><Icon name="back" /></button>
          <span className="week-label">
            <strong>{formatDay(week).replace(/^\w+, /, '')} – {formatDay(end).replace(/^\w+, /, '')}</strong>
            <small>{week === weekStart(today) ? 'This week' : week === addDays(weekStart(today), 7) ? 'Next week' : week < today ? 'Past week' : 'Upcoming'}</small>
          </span>
          <button className="icon-btn" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week"><Icon name="chevron" /></button>
        </div>
      </div>
      <p className="muted lede">
        {canSchedule
          ? 'Pick who leads each shift. The store tablet selects that lead by itself, and ratings of the shift count for them. Pick “Add a name” for someone who isn’t on the list yet; they don’t need an account.'
          : 'Who is leading each shift. Directors and admins set this.'}
      </p>

      {loading ? (
        <div className="spinner" />
      ) : (
        <>
          <section className="card schedule-card">
            <div className="schedule-grid" role="table" aria-label="Shift Lead schedule" style={{ ['--shifts' as string]: shiftNames.length }}>
              <div className="schedule-row schedule-head" role="row">
                <span role="columnheader">Day</span>
                {shiftNames.map((s) => (
                  <span key={s} role="columnheader" className={`schedule-shift tone-${shiftTone(shiftNames, s)}`}><i className="shift-dot" aria-hidden="true" />{s} shift</span>
                ))}
              </div>
              {days.map((d) => (
                <div key={d} className={`schedule-row ${d === today ? 'is-today' : ''} ${d < today ? 'is-past' : ''}`} role="row">
                  <span className="schedule-day" role="rowheader">
                    <strong>{formatDay(d).split(',')[0]}</strong>
                    <small>{formatDay(d).replace(/^\w+, /, '')}{d === today && ' · today'}</small>
                  </span>
                  {shiftNames.map((s) => {
                    const e = entryFor(d, s);
                    const mine = !!e && e.lead_id === myLeadId;
                    const now = d === today && s === shift;
                    return (
                      <span key={s} role="cell" className={`schedule-cell ${mine ? 'is-mine' : ''} ${now ? 'is-now' : ''}`} data-shift={`${s} shift`}>
                        {canSchedule ? (
                          <select
                            className={e ? 'filled' : ''}
                            aria-label={`${s} Shift Lead on ${formatDay(d)}`}
                            value={e?.lead_id ?? ''}
                            onChange={(ev) => (ev.target.value === ADD ? setAdding({ date: d, shift: s }) : setLead(d, s, ev.target.value))}
                          >
                            <option value="">Not set</option>
                            {e && !leads.some((l) => l.id === e.lead_id) && <option value={e.lead_id}>{nameOf(e.lead_id)}</option>}
                            {leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                            <option value={ADD}>+ Add a name…</option>
                          </select>
                        ) : e ? (
                          <span className="schedule-name"><span className="avatar sm" aria-hidden="true">{nameOf(e.lead_id).slice(0, 1).toUpperCase()}</span>{nameOf(e.lead_id)}{mine && <span className="pill pill-accent">You</span>}</span>
                        ) : (
                          <span className="muted">Not set</span>
                        )}
                        {canSchedule && e && d >= today && (
                          <span className={`sent-mark ${e.notified_at ? 'ok' : ''}`} title={e.notified_at ? 'Schedule sent to this lead' : 'Not sent yet'}>
                            <Icon name={e.notified_at ? 'done' : 'bell'} size={14} />
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
            {canSchedule && (
              <div className="schedule-actions">
                <button className="btn btn-ghost btn-sm" onClick={copyLastWeek}><Icon name="copy" size={16} /> Copy last week</button>
                {counts.size > 0 && (
                  <span className="muted small">
                    {[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${nameOf(id)} ${n}`).join(' · ')}
                  </span>
                )}
              </div>
            )}
          </section>

          {canSchedule && (
            <section className="card send-card">
              <span className="kpi-icon"><Icon name="bell" size={20} /></span>
              <div className="grow">
                <strong>
                  {!settings.notifications_enabled
                    ? 'Phone notifications are off'
                    : upcoming.length === 0
                      ? 'No upcoming shifts on this week yet'
                      : unsent.length === 0
                        ? 'Everyone on this week has been told'
                        : `${unsent.length} shift${unsent.length === 1 ? '' : 's'} not sent yet`}
                </strong>
                <p className="muted small">
                  {settings.notifications_enabled
                    ? 'Sending notifies each lead about their own shifts only. Leads who are off get nothing. Each lead also gets a reminder an hour before their shift.'
                    : <>Turn them on to tell each lead about their shifts. {isAdmin ? <Link to="/setup?tab=store">Setup → Store</Link> : 'An admin can do this in Setup → Store.'}</>}
                  {settings.notifications_enabled && noAccount.length > 0 && ` No linked account, so tell them in person: ${noAccount.map(nameOf).join(', ')}.`}
                </p>
              </div>
              {settings.notifications_enabled && (
                <button className="btn btn-primary" onClick={send} disabled={sending || unsent.length === 0}>
                  <Icon name="bell" size={18} /> {sending ? 'Sending…' : 'Send schedule to leads'}
                </button>
              )}
            </section>
          )}
        </>
      )}

      {adding && (
        <AddNameModal
          onClose={() => setAdding(null)}
          onAdded={async (id) => {
            await setLead(adding.date, adding.shift, id);
            setAdding(null);
          }}
        />
      )}
    </div>
  );
}

function AddNameModal({ onClose, onAdded }: { onClose: () => void; onAdded: (leadId: string) => void }) {
  const { toast } = useApp();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('add_hoh_lead', { p_name: name.trim() });
    setBusy(false);
    if (error || !data) return toast(errorMessage(error), 'error');
    onAdded(data as string);
  }
  return (
    <Modal title="Add a name to the schedule" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <p className="muted">They’re added to the HOH Leads list and can be picked from now on. They don’t need an account in the app.</p>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Marcus" />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy || !name.trim()}>{busy ? 'Adding…' : 'Add to this shift'}</button>
      </form>
    </Modal>
  );
}
