import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/app';
import { supabase, errorMessage } from '../lib/supabase';
import { useRealtime } from '../lib/useRealtime';
import { addDays, formatDateTime, formatDay, formatTime } from '../lib/dates';
import { previousShift } from '../lib/handoff';
import { removeFiles, uploadFile } from '../lib/files';
import { shiftTone } from '../lib/tone';
import type { HandoffPhoto, ShiftHandoff } from '../lib/types';
import Icon from '../components/Icon';
import Stars, { RATING_WORDS } from '../components/Stars';
import { PhotoPicker, PhotoThumb } from '../components/Photo';
import { useConfirm } from '../components/Confirm';

const key = (date: string, shift: string) => `${date}|${shift}`;

/** Handoffs + photos for the last two weeks, kept live. */
export function useHandoffs(today: string) {
  const [handoffs, setHandoffs] = useState<ShiftHandoff[]>([]);
  const [photos, setPhotos] = useState<HandoffPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const { data } = await supabase
      .from('shift_handoffs')
      .select('*')
      .gte('shift_date', addDays(today, -14))
      .order('shift_date', { ascending: false });
    const list = (data as ShiftHandoff[]) ?? [];
    setHandoffs(list);
    if (list.length) {
      const { data: ph } = await supabase.from('handoff_photos').select('*').in('handoff_id', list.map((h) => h.id)).order('created_at');
      setPhotos((ph as HandoffPhoto[]) ?? []);
    } else setPhotos([]);
    setLoading(false);
  }, [today]);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['shift_handoffs', 'handoff_photos'], load);

  const byKey = useMemo(() => new Map(handoffs.map((h) => [key(h.shift_date, h.shift), h])), [handoffs]);
  const photosFor = useCallback((h?: ShiftHandoff) => (h ? photos.filter((p) => p.handoff_id === h.id) : []), [photos]);
  return { handoffs, byKey, photosFor, loading, reload: load };
}

export default function Handoff() {
  const { today, shift, shiftNames } = useApp();
  const { handoffs, byKey, photosFor, loading, reload } = useHandoffs(today);
  const prev = previousShift(today, shift, shiftNames);
  const prevHandoff = byKey.get(key(prev.date, prev.shift));
  const mine = byKey.get(key(today, shift));
  const history = handoffs.filter((h) => !(h.shift_date === today && h.shift === shift));

  return (
    <div className="page sec-handoff">
      <div className="page-title">
        <span className="page-icon"><Icon name="swap" size={22} /></span>
        <h1>Shift Handoff</h1>
      </div>

      {loading ? (
        <div className="spinner" />
      ) : (
        <>
          <RateCard date={prev.date} shift={prev.shift} handoff={prevHandoff} photos={photosFor(prevHandoff)} onSaved={reload} />
          <MyHandoffCard date={today} shift={shift} handoff={mine} photos={photosFor(mine)} onSaved={reload} />

          <section className="stack">
            <h2 className="section-title">Recent handoffs</h2>
            {history.length === 0 ? (
              <div className="empty">No earlier handoffs yet.</div>
            ) : (
              <div className="handoff-history">
                {history.map((h) => (
                  <HistoryRow key={h.id} handoff={h} photos={photosFor(h)} tone={shiftTone(shiftNames, h.shift)} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ShiftBadge({ shift, date }: { shift: string; date: string }) {
  const { shiftNames, today } = useApp();
  return (
    <span className={`shift-badge tone-${shiftTone(shiftNames, shift)}`}>
      {shift} shift · {date === today ? 'today' : date === addDays(today, -1) ? 'yesterday' : formatDay(date)}
    </span>
  );
}

/* ---------------- Incoming shift: rate the previous setup ---------------- */
export function RateCard({ date, shift, handoff, photos, onSaved, compact }: { date: string; shift: string; handoff?: ShiftHandoff; photos: HandoffPhoto[]; onSaved: () => void; compact?: boolean }) {
  const { ensureActor, actorLeadId, toast } = useApp();
  const [editing, setEditing] = useState(!handoff?.rating);
  const [rating, setRating] = useState(handoff?.rating ?? 0);
  const [comment, setComment] = useState(handoff?.rating_comment ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setEditing(!handoff?.rating);
    setRating(handoff?.rating ?? 0);
    setComment(handoff?.rating_comment ?? '');
  }, [handoff?.rating, handoff?.rating_comment]);

  async function save() {
    if (!rating) return toast('Tap the stars to rate the setup', 'error');
    if (!ensureActor()) return;
    setSaving(true);
    const { error } = await supabase.rpc('rate_handoff', { p_date: date, p_shift: shift, p_rating: rating, p_comment: comment.trim() || null, p_lead_id: actorLeadId });
    setSaving(false);
    if (error) return toast(errorMessage(error), 'error');
    toast(`Rated the ${shift} shift ${rating} star${rating > 1 ? 's' : ''}`);
    setEditing(false);
    onSaved();
  }

  return (
    <section className="card rate-card">
      <div className="card-head">
        <h2><span className="dot" />Rate the {shift} shift's setup</h2>
        <ShiftBadge shift={shift} date={date} />
      </div>

      {!compact && (
        <div className="left-for-you">
          <span className="eyebrow">What they left for you</span>
          {handoff?.notes ? (
            <blockquote className="handoff-note">
              {handoff.notes}
              <cite>{handoff.notes_by_name}{handoff.notes_at ? ` · ${formatTime(handoff.notes_at)}` : ''}</cite>
            </blockquote>
          ) : (
            <p className="muted small">No notes from the {shift} shift.</p>
          )}
          {photos.length > 0 ? (
            <div className="photo-grid">{photos.map((p) => <PhotoThumb key={p.id} path={p.path} label={p.uploaded_by_name} />)}</div>
          ) : (
            <p className="muted small">No photos uploaded.</p>
          )}
        </div>
      )}

      {editing ? (
        <div className="rate-form">
          <Stars value={rating} onChange={setRating} size="lg" />
          <span className="rating-word">{RATING_WORDS[rating] || 'How was the setup when you came in?'}</span>
          <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Anything they did great, or should fix next time? (optional)" aria-label="Rating comment" />
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Submit rating'}</button>
        </div>
      ) : (
        <div className="rated">
          <Stars value={handoff?.rating ?? 0} />
          <div>
            <strong>{RATING_WORDS[handoff?.rating ?? 0]}</strong>
            {handoff?.rating_comment && <p className="rated-comment">“{handoff.rating_comment}”</p>}
            <span className="muted small">Rated by {handoff?.rated_by_name}{handoff?.rated_at ? ` · ${formatTime(handoff.rated_at)}` : ''}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Change</button>
        </div>
      )}
    </section>
  );
}

/* ---------------- Leaving shift: notes + required photos ---------------- */
function MyHandoffCard({ date, shift, handoff, photos, onSaved }: { date: string; shift: string; handoff?: ShiftHandoff; photos: HandoffPhoto[]; onSaved: () => void }) {
  const { ensureActor, actorLeadId, toast, session, isManager, shiftNames } = useApp();
  const confirm = useConfirm();
  const [notes, setNotes] = useState(handoff?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => setNotes(handoff?.notes ?? ''), [handoff?.notes]);
  const isClose = shiftNames.indexOf(shift) === shiftNames.length - 1;
  const submitted = !!handoff?.submitted_at;

  async function addPhotos(files: File[]) {
    if (!ensureActor()) return;
    setUploading(true);
    let added = 0;
    for (const f of files) {
      try {
        const { path } = await uploadFile(`handoffs/${date}-${shift}`, f);
        const { error } = await supabase.rpc('add_handoff_photo', { p_date: date, p_shift: shift, p_path: path, p_lead_id: actorLeadId });
        if (error) throw error;
        added++;
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    }
    setUploading(false);
    if (added) toast(`${added} photo${added > 1 ? 's' : ''} uploaded`);
    onSaved();
  }

  async function deletePhoto(p: HandoffPhoto) {
    if (!(await confirm({ title: 'Remove this photo?', confirmLabel: 'Remove', danger: true }))) return;
    const { error } = await supabase.from('handoff_photos').delete().eq('id', p.id);
    if (error) return toast(errorMessage(error), 'error');
    await removeFiles([p.path]);
    onSaved();
  }

  async function save(submit: boolean) {
    if (!ensureActor()) return;
    if (submit && photos.length === 0) return toast('Upload at least one photo of the setup first', 'error');
    setSaving(true);
    const { error } = await supabase.rpc('save_handoff', { p_date: date, p_shift: shift, p_notes: notes.trim() || null, p_lead_id: actorLeadId, p_submit: submit });
    setSaving(false);
    if (error) return toast(errorMessage(error), 'error');
    toast(submit ? `${shift} handoff submitted` : 'Notes saved');
    onSaved();
  }

  return (
    <section className={`card my-handoff ${submitted ? 'is-done' : ''}`}>
      <div className="card-head">
        <h2><span className="dot" />{isClose ? 'Close-out' : 'Shift swap'}: {shift} shift handoff</h2>
        <ShiftBadge shift={shift} date={date} />
      </div>
      {submitted ? (
        <div className="done-banner"><Icon name="done" size={18} /> Submitted by {handoff?.submitted_by_name} at {formatTime(handoff!.submitted_at!)}. You can still add photos or update notes.</div>
      ) : (
        <p className="muted small">Before you leave: upload photos of your setup{isClose ? ' after close' : ' for the next shift'}, and leave any notes. Photos are required.</p>
      )}

      <div className="field">
        <span>Photos {photos.length > 0 && `(${photos.length})`}</span>
        <div className="photo-grid">
          {photos.map((p) => (
            <PhotoThumb key={p.id} path={p.path} label={p.uploaded_by_name} onDelete={p.user_id === session?.user.id || isManager ? () => deletePhoto(p) : undefined} />
          ))}
          <PhotoPicker onFiles={addPhotos} busy={uploading} className="photo-add">
            {photos.length ? 'Add more' : 'Take photos'}
          </PhotoPicker>
        </div>
      </div>

      <label className="field">
        <span>Notes for the next shift (optional)</span>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Low on breading flour, fryer 2 was filtered late, great teamwork today" />
      </label>

      <div className="confirm-actions">
        <button className="btn btn-ghost" onClick={() => save(false)} disabled={saving || (notes.trim() === (handoff?.notes ?? ''))}>Save notes</button>
        <button className="btn btn-primary" onClick={() => save(true)} disabled={saving}>
          <Icon name="done" size={18} /> {submitted ? 'Submit again' : 'Submit handoff'}
        </button>
      </div>
    </section>
  );
}

function HistoryRow({ handoff, photos, tone }: { handoff: ShiftHandoff; photos: HandoffPhoto[]; tone: string }) {
  const [open, setOpen] = useState(false);
  return (
    <article className={`history-row tone-${tone}`}>
      <button className="history-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="history-shift">{handoff.shift}</span>
        <span className="history-main">
          <strong>{formatDay(handoff.shift_date)}</strong>
          <span className="muted small">
            {handoff.submitted_at ? `Submitted by ${handoff.submitted_by_name}` : 'Not submitted'} · {photos.length} photo{photos.length === 1 ? '' : 's'}
          </span>
        </span>
        {handoff.rating ? <Stars value={handoff.rating} size="sm" /> : <span className="pill">Not rated</span>}
        <Icon name={open ? 'up' : 'down'} size={18} />
      </button>
      {open && (
        <div className="history-body">
          {handoff.notes && (
            <blockquote className="handoff-note">
              {handoff.notes}
              <cite>{handoff.notes_by_name}</cite>
            </blockquote>
          )}
          {handoff.rating && (
            <p className="small">
              <strong>{RATING_WORDS[handoff.rating]}</strong> · rated by {handoff.rated_by_name}{handoff.rated_at ? `, ${formatDateTime(handoff.rated_at)}` : ''}
              {handoff.rating_comment && <><br />“{handoff.rating_comment}”</>}
            </p>
          )}
          {photos.length > 0 ? (
            <div className="photo-grid">{photos.map((p) => <PhotoThumb key={p.id} path={p.path} label={p.uploaded_by_name} />)}</div>
          ) : (
            <p className="muted small">No photos.</p>
          )}
        </div>
      )}
    </article>
  );
}
