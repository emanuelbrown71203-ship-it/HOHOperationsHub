import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorMessage } from '../lib/supabase';
import { useRealtime } from '../lib/useRealtime';
import { addDays, formatDay } from '../lib/dates';
import type { CoachingNote } from '../lib/types';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import { useConfirm } from '../components/Confirm';

/** Coaching notes, newest first, kept live. Directors and admins see all; a lead sees only notes shared with them. */
export function useCoachingNotes(leadId?: string | null) {
  const [notes, setNotes] = useState<CoachingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    let q = supabase.from('coaching_notes').select('*');
    if (leadId) q = q.eq('lead_id', leadId);
    const { data } = await q.order('created_at', { ascending: false }).limit(500);
    setNotes((data as CoachingNote[]) ?? []);
    setLoading(false);
  }, [leadId]);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['coaching_notes'], load);
  return { notes, loading, reload: load };
}

export const followUpDue = (n: CoachingNote, today: string) => !!n.follow_up_on && !n.follow_up_done_at && n.follow_up_on <= today;

export default function Coaching() {
  const { today, leads } = useApp();
  const [params, setParams] = useSearchParams();
  const { notes, loading, reload } = useCoachingNotes();
  const [editing, setEditing] = useState<CoachingNote | null>(null);
  const filter = params.get('person');
  const setFilter = (p: string | null) => {
    const next = new URLSearchParams(params);
    if (p) next.set('person', p);
    else next.delete('person');
    next.delete('lead');
    setParams(next, { replace: true });
  };

  const people = [...new Set([...leads.map((l) => l.name), ...notes.map((n) => n.subject_name)])];
  const shown = filter ? notes.filter((n) => n.subject_name === filter) : notes;
  const due = notes.filter((n) => followUpDue(n, today));
  const upcoming = notes.filter((n) => n.follow_up_on && !n.follow_up_done_at && n.follow_up_on > today && n.follow_up_on <= addDays(today, 7));

  return (
    <div className="page sec-scores">
      <div className="page-title">
        <span className="page-icon"><Icon name="edit" size={22} /></span>
        <h1>Coaching Notes</h1>
      </div>
      <p className="muted lede">
        Keep track of what you talked about with each HOH Lead: what to work on, praise, and when to follow up. Only directors and admins see these, unless you share a note with that lead.
      </p>

      <div className="dash-grid">
        <NoteForm key={params.get('lead') ?? 'new'} initialLeadId={params.get('lead')} onSaved={reload} />
        <section className="card">
          <div className="card-head">
            <h2><span className="dot dot-danger" />Follow-ups</h2>
            <span className="todo-count">{due.length} due</span>
          </div>
          {due.length + upcoming.length === 0 ? (
            <div className="all-clear"><Icon name="done" size={18} /> No follow-ups coming up</div>
          ) : (
            <div className="coach-list">
              {[...due, ...upcoming].map((n) => <NoteCard key={n.id} note={n} onEdit={() => setEditing(n)} onChanged={reload} />)}
            </div>
          )}
        </section>
      </div>

      <section className="stack">
        <div className="row-between wrap">
          <h2 className="section-title">All notes</h2>
          <div className="chips">
            <button className={`chip ${!filter ? 'on' : ''}`} onClick={() => setFilter(null)}>Everyone ({notes.length})</button>
            {people.map((p) => {
              const c = notes.filter((n) => n.subject_name === p).length;
              return c > 0 ? <button key={p} className={`chip ${filter === p ? 'on' : ''}`} onClick={() => setFilter(p)}>{p} ({c})</button> : null;
            })}
          </div>
        </div>
        {loading ? (
          <div className="spinner" />
        ) : shown.length === 0 ? (
          <div className="empty">No coaching notes yet. Add the first one above.</div>
        ) : (
          <div className="coach-list">{shown.map((n) => <NoteCard key={n.id} note={n} onEdit={() => setEditing(n)} onChanged={reload} />)}</div>
        )}
      </section>

      {editing && (
        <Modal title={`Edit note about ${editing.subject_name}`} onClose={() => setEditing(null)}>
          <NoteForm existing={editing} onSaved={() => { setEditing(null); reload(); }} bare />
        </Modal>
      )}
    </div>
  );
}

const FOLLOW_UPS: [string, number | null][] = [['No follow-up', null], ['In 1 week', 7], ['In 2 weeks', 14], ['In 30 days', 30]];

/** Write (or edit) a coaching note. */
export function NoteForm({ existing, initialLeadId, onSaved, bare }: { existing?: CoachingNote; initialLeadId?: string | null; onSaved: () => void; bare?: boolean }) {
  const { today, leads, toast } = useApp();
  const [leadId, setLeadId] = useState<string | null>(existing ? existing.lead_id : initialLeadId ?? null);
  const [other, setOther] = useState(existing && !existing.lead_id ? existing.subject_name : '');
  const [someone, setSomeone] = useState(!!existing && !existing.lead_id);
  const [kind, setKind] = useState<CoachingNote['kind']>(existing?.kind ?? 'coaching');
  const [text, setText] = useState(existing?.note ?? '');
  const [followUp, setFollowUp] = useState<string>(existing?.follow_up_on ?? '');
  const [share, setShare] = useState(existing?.shared_with_lead ?? false);
  const [saving, setSaving] = useState(false);
  const lead = leads.find((l) => l.id === leadId) ?? null;
  const subject = lead?.name ?? (someone ? other.trim() : '');

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!subject) return toast('Pick who the note is about', 'error');
    if (!text.trim()) return toast('Write the note', 'error');
    setSaving(true);
    const row = {
      lead_id: lead?.id ?? null,
      subject_name: subject,
      kind,
      note: text.trim(),
      follow_up_on: followUp || null,
      shared_with_lead: !!lead?.profile_id && share,
      updated_at: new Date().toISOString(),
    };
    const { error } = existing ? await supabase.from('coaching_notes').update(row).eq('id', existing.id) : await supabase.from('coaching_notes').insert(row);
    setSaving(false);
    if (error) return toast(errorMessage(error), 'error');
    toast(existing ? 'Note updated' : `Note saved for ${subject}`);
    if (!existing) {
      setText('');
      setFollowUp('');
      setShare(false);
    }
    onSaved();
  }

  const body = (
    <form className="stack coach-form" onSubmit={save}>
      {!bare && <h2>Add a note</h2>}
      <div className="field">
        <span>Who is it about?</span>
        <div className="chips">
          {leads.map((l) => (
            <button key={l.id} type="button" className={`chip ${leadId === l.id ? 'on' : ''}`} onClick={() => { setLeadId(l.id); setSomeone(false); }}>{l.name}</button>
          ))}
          <button type="button" className={`chip ${someone ? 'on' : ''}`} onClick={() => { setLeadId(null); setSomeone(true); }}>Someone else</button>
        </div>
        {someone && <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Their name" aria-label="Name of the person" />}
      </div>
      <div className="segmented" role="radiogroup" aria-label="Kind of note">
        <button type="button" role="radio" aria-checked={kind === 'coaching'} className={kind === 'coaching' ? 'on' : ''} onClick={() => setKind('coaching')}>Coaching</button>
        <button type="button" role="radio" aria-checked={kind === 'praise'} className={kind === 'praise' ? 'on' : ''} onClick={() => setKind('praise')}>Praise</button>
      </div>
      <label className="field">
        <span>Note</span>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'praise' ? 'e.g. Ran a spotless close on Friday during the catering rush.' : 'e.g. Talked about wiping down the breading table before swap. Agreed to check it at 1:30.'} />
      </label>
      <div className="field">
        <span>Follow up</span>
        <div className="chips">
          {FOLLOW_UPS.map(([label, days]) => {
            const value = days === null ? '' : addDays(today, days);
            return <button key={label} type="button" className={`chip ${followUp === value ? 'on' : ''}`} onClick={() => setFollowUp(value)}>{label}</button>;
          })}
          <input type="date" className="date-chip" value={followUp} min={today} onChange={(e) => setFollowUp(e.target.value)} aria-label="Follow-up date" />
        </div>
      </div>
      {lead && (lead.profile_id ? (
        <label className={`toggle ${share ? 'toggle-on' : ''}`}>
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
          <span className="toggle-track" aria-hidden="true"><span /></span>
          <span>Let {lead.name} see this note</span>
        </label>
      ) : (
        <p className="muted small">Private to directors and admins. To share notes with {lead.name}, link their account in Setup → HOH Leads.</p>
      ))}
      <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : existing ? 'Save changes' : 'Save note'}</button>
    </form>
  );
  return bare ? body : <section className="card">{body}</section>;
}

export function NoteCard({ note: n, onEdit, onChanged, compact }: { note: CoachingNote; onEdit?: () => void; onChanged?: () => void; compact?: boolean }) {
  const { today, toast, canSchedule } = useApp();
  const confirm = useConfirm();
  const due = followUpDue(n, today);
  async function markDone() {
    const { error } = await supabase.from('coaching_notes').update({ follow_up_done_at: new Date().toISOString() }).eq('id', n.id);
    if (error) return toast(errorMessage(error), 'error');
    toast('Marked followed up');
    onChanged?.();
  }
  async function remove() {
    if (!(await confirm({ title: 'Delete this note?', body: `About ${n.subject_name}, from ${formatDay(n.created_at.slice(0, 10))}.`, confirmLabel: 'Delete', danger: true }))) return;
    const { error } = await supabase.from('coaching_notes').delete().eq('id', n.id);
    if (error) return toast(errorMessage(error), 'error');
    onChanged?.();
  }
  return (
    <article className={`coach-card kind-${n.kind} ${due ? 'is-due' : ''}`}>
      <div className="coach-top">
        <strong>{n.subject_name}</strong>
        <span className={`pill ${n.kind === 'praise' ? 'pill-ok' : 'pill-accent'}`}>{n.kind === 'praise' ? 'Praise' : 'Coaching'}</span>
        {n.shared_with_lead && <span className="pill">Shared with them</span>}
        <span className="muted small coach-date">{formatDay(n.created_at.slice(0, 10))} · {n.created_by_name}</span>
      </div>
      <p className="coach-text">{n.note}</p>
      {canSchedule && (n.follow_up_on || !compact) && (
        <div className="coach-foot">
          {n.follow_up_on && (
            n.follow_up_done_at ? (
              <span className="muted small"><Icon name="done" size={14} /> Followed up</span>
            ) : (
              <>
                <span className={`follow ${due ? 'due' : ''}`}><Icon name="clock" size={14} /> {due ? 'Follow up due' : 'Follow up'} {n.follow_up_on === today ? 'today' : formatDay(n.follow_up_on)}</span>
                <button className="btn btn-ghost btn-sm" onClick={markDone}>Mark followed up</button>
              </>
            )
          )}
          {!compact && (
            <span className="coach-actions">
              {onEdit && <button className="icon-btn sm-lg" onClick={onEdit} aria-label="Edit note"><Icon name="edit" size={16} /></button>}
              <button className="icon-btn sm-lg" onClick={remove} aria-label="Delete note"><Icon name="trash" size={16} /></button>
            </span>
          )}
        </div>
      )}
    </article>
  );
}

/** A lead's recent coaching notes, for their score page (directors and admins). */
export function LeadCoachingSection({ leadId, leadName }: { leadId: string; leadName: string }) {
  const { notes, reload } = useCoachingNotes(leadId);
  return (
    <section className="card">
      <div className="card-head">
        <h2><span className="dot" />Coaching notes</h2>
        <Link to={`/coaching?lead=${leadId}`} className="link-more"><Icon name="plus" size={16} /> Add a note</Link>
      </div>
      {notes.length === 0 ? (
        <p className="muted">No coaching notes about {leadName} yet.</p>
      ) : (
        <div className="coach-list">
          {notes.slice(0, 5).map((n) => <NoteCard key={n.id} note={n} onChanged={reload} compact />)}
          {notes.length > 5 && <Link to={`/coaching?person=${encodeURIComponent(leadName)}`} className="link-more">All {notes.length} notes</Link>}
        </div>
      )}
    </section>
  );
}
