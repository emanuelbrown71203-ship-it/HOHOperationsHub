import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorMessage } from '../lib/supabase';
import { useRealtime } from '../lib/useRealtime';
import { addDays, formatDateTime, timeAgo } from '../lib/dates';
import { removeFiles, uploadFile } from '../lib/files';
import type { Equipment, EquipmentLog } from '../lib/types';
import Modal from '../components/Modal';
import Icon, { categoryIcon } from '../components/Icon';
import { PhotoPicker, PhotoThumb } from '../components/Photo';
import { useConfirm } from '../components/Confirm';

/** Equipment + kitchen notes ("issue" logs), kept live. */
export function useKitchenNotes(today: string) {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [open, setOpen] = useState<EquipmentLog[]>([]);
  const [recent, setRecent] = useState<EquipmentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const [eq, op, rc] = await Promise.all([
      supabase.from('equipment').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('equipment_logs').select('*').eq('log_type', 'issue').eq('status', 'open').order('logged_at', { ascending: false }),
      supabase.from('equipment_logs').select('*').eq('log_type', 'issue').gte('log_date', addDays(today, -60)).order('logged_at', { ascending: false }).limit(500),
    ]);
    setEquipment((eq.data as Equipment[]) ?? []);
    setOpen((op.data as EquipmentLog[]) ?? []);
    setRecent((rc.data as EquipmentLog[]) ?? []);
    setLoading(false);
  }, [today]);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['equipment_logs', 'equipment'], load);
  const nameOf = useCallback((id: string) => equipment.find((e) => e.id === id)?.name ?? 'Removed equipment', [equipment]);
  return { equipment, open, recent, loading, reload: load, nameOf };
}

export default function Notes() {
  const { today } = useApp();
  const [params, setParams] = useSearchParams();
  const { equipment, open, recent, loading, reload, nameOf } = useKitchenNotes(today);
  const [resolving, setResolving] = useState<EquipmentLog | null>(null);
  const viewing = equipment.find((e) => e.id === params.get('eq')) ?? null;
  const composing = params.get('new') === '1';
  const fixed = recent.filter((n) => n.status === 'resolved').slice(0, 20);

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const categories = useMemo(() => {
    const groups = new Map<string, Equipment[]>();
    for (const e of equipment) groups.set(e.category, [...(groups.get(e.category) ?? []), e]);
    return [...groups.entries()];
  }, [equipment]);

  return (
    <div className="page sec-notes">
      <div className="page-head">
        <div className="page-title">
          <span className="page-icon"><Icon name="note" size={22} /></span>
          <h1>Kitchen Notes</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setParam('new', '1')}>
          <Icon name="plus" size={18} /> New note
        </button>
      </div>
      <p className="muted lede">Something broken or needs attention? Leave a note. It stays pinned on Home until someone marks it fixed.</p>

      {loading ? (
        <div className="spinner" />
      ) : (
        <>
          <section className="stack">
            <h2 className="section-title"><span className="dot dot-danger" /> Needs attention ({open.length})</h2>
            {open.length === 0 ? (
              <div className="all-clear big"><Icon name="done" size={20} /> Nothing broken right now.</div>
            ) : (
              <div className="note-board">
                {open.map((n) => (
                  <NoteCard key={n.id} note={n} equipmentName={nameOf(n.equipment_id)} onResolve={() => setResolving(n)} onChanged={reload} />
                ))}
              </div>
            )}
          </section>

          <section className="stack">
            <h2 className="section-title">Equipment</h2>
            <p className="muted small">Tap anything to see its notes or add one.</p>
            {categories.map(([cat, list]) => (
              <div key={cat} className="equip-group">
                <span className="equip-cat"><Icon name={categoryIcon(cat)} size={15} /> {cat}</span>
                <div className="equip-chips">
                  {list.map((e) => {
                    const count = open.filter((n) => n.equipment_id === e.id).length;
                    return (
                      <button key={e.id} className={`equip-chip ${count ? 'has-notes' : ''}`} onClick={() => setParam('eq', e.id)}>
                        {e.name}
                        {count > 0 && <span className="badge">{count}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>

          {fixed.length > 0 && (
            <section className="stack">
              <h2 className="section-title">Recently fixed</h2>
              <div className="card">
                <ul className="entries">
                  {fixed.map((n) => (
                    <li key={n.id} className="entry">
                      <span className="fixed-check"><Icon name="done" size={16} /></span>
                      <div className="entry-main">
                        <strong>{nameOf(n.equipment_id)}</strong>
                        <span>{n.notes}</span>
                        <span className="muted small">
                          Fixed {n.resolved_at ? timeAgo(n.resolved_at) : ''} by {n.resolved_by_name}
                          {n.resolution_notes ? ` · ${n.resolution_notes}` : ''}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </>
      )}

      {composing && <NewNoteModal equipment={equipment} initialId={params.get('eq')} onClose={() => setParam('new', null)} onSaved={reload} />}
      {viewing && !composing && (
        <EquipmentModal
          equipment={viewing}
          notes={recent.filter((n) => n.equipment_id === viewing.id)}
          onClose={() => setParam('eq', null)}
          onAdd={() => setParam('new', '1')}
          onResolve={setResolving}
          onChanged={reload}
        />
      )}
      {resolving && <ResolveModal note={resolving} equipmentName={nameOf(resolving.equipment_id)} onClose={() => setResolving(null)} onSaved={reload} />}
    </div>
  );
}

export function NoteCard({ note, equipmentName, onResolve, onChanged, compact }: { note: EquipmentLog; equipmentName: string; onResolve?: () => void; onChanged?: () => void; compact?: boolean }) {
  const { session, isManager, toast } = useApp();
  const confirm = useConfirm();
  const canDelete = !compact && onChanged && (note.user_id === session?.user.id || isManager);
  async function remove() {
    if (!(await confirm({ title: 'Delete this note?', body: 'Use "Mark fixed" instead if the problem was solved, so there is a record.', confirmLabel: 'Delete', danger: true }))) return;
    const { error } = await supabase.from('equipment_logs').delete().eq('id', note.id);
    if (error) return toast(errorMessage(error), 'error');
    if (note.photo_path) await removeFiles([note.photo_path]);
    toast('Note deleted');
    onChanged?.();
  }
  return (
    <article className={`note-card ${note.status === 'resolved' ? 'is-fixed' : ''}`}>
      <div className="note-pin" aria-hidden="true" />
      <div className="note-top">
        <strong className="note-equip">{equipmentName}</strong>
        <span className="muted small">{timeAgo(note.logged_at)}</span>
      </div>
      <p className="note-text">{note.notes}</p>
      {note.photo_path && <div className="photo-grid one"><PhotoThumb path={note.photo_path} label={equipmentName} /></div>}
      <div className="note-foot">
        <span className="muted small">{note.performed_by_name} · {note.shift} shift</span>
        <div className="row-gap">
          {canDelete && <button className="icon-btn sm-lg" onClick={remove} aria-label="Delete note"><Icon name="trash" size={16} /></button>}
          {onResolve && note.status === 'open' && <button className="btn btn-sm btn-fix" onClick={onResolve}><Icon name="done" size={16} /> Mark fixed</button>}
        </div>
      </div>
      {note.status === 'resolved' && (
        <div className="note-fixed">
          <Icon name="done" size={14} /> Fixed by {note.resolved_by_name}{note.resolved_at ? ` · ${formatDateTime(note.resolved_at)}` : ''}
          {note.resolution_notes && <div>{note.resolution_notes}</div>}
        </div>
      )}
    </article>
  );
}

function NewNoteModal({ equipment, initialId, onClose, onSaved }: { equipment: Equipment[]; initialId: string | null; onClose: () => void; onSaved: () => void }) {
  const { today, shift, ensureActor, actorLeadId, actorName, toast } = useApp();
  const [equipmentId, setEquipmentId] = useState(initialId ?? equipment[0]?.id ?? '');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!photo) return setPreview(null);
    const u = URL.createObjectURL(photo);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);

  async function save() {
    if (!equipmentId) return toast('Choose what the note is about', 'error');
    if (!text.trim()) return toast("Describe what's wrong", 'error');
    if (!ensureActor()) return;
    setSaving(true);
    try {
      const photo_path = photo ? (await uploadFile(`notes/${today}`, photo)).path : null;
      const { error } = await supabase.from('equipment_logs').insert({
        equipment_id: equipmentId,
        log_type: 'issue',
        notes: text.trim(),
        photo_path,
        shift,
        log_date: today,
        lead_id: actorLeadId,
      });
      if (error) throw error;
      toast('Note posted');
      onSaved();
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New kitchen note" onClose={onClose}>
      <label className="field">
        <span>What's it about?</span>
        <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
          {equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Note</span>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Fryer 3 won't come up to temp. Called the tech, coming Tuesday." autoFocus />
      </label>
      <div className="field">
        <span>Photo (optional)</span>
        <div className="row-gap wrap">
          {preview && <img className="photo-preview" src={preview} alt="" />}
          <PhotoPicker onFiles={(f) => setPhoto(f[0])} multiple={false}>{photo ? 'Change photo' : 'Add a photo'}</PhotoPicker>
          {photo && <button className="btn btn-ghost btn-sm" onClick={() => setPhoto(null)}>Remove</button>}
        </div>
      </div>
      <button className="btn btn-primary btn-block" onClick={save} disabled={saving}>{saving ? 'Posting…' : 'Post note'}</button>
      <p className="muted small center">{shift} shift · {actorName ? `Posted as ${actorName}` : 'Choose the Shift Lead first'}</p>
    </Modal>
  );
}

function EquipmentModal({ equipment, notes, onClose, onAdd, onResolve, onChanged }: { equipment: Equipment; notes: EquipmentLog[]; onClose: () => void; onAdd: () => void; onResolve: (n: EquipmentLog) => void; onChanged: () => void }) {
  return (
    <Modal title={equipment.name} onClose={onClose}>
      <button className="btn btn-primary btn-block" onClick={onAdd}><Icon name="plus" size={18} /> Add a note about {equipment.name}</button>
      <h3>Notes ({notes.length})</h3>
      {notes.length === 0 ? (
        <p className="muted">No notes in the last 60 days.</p>
      ) : (
        <div className="note-thread">
          {notes.map((n) => <NoteCard key={n.id} note={n} equipmentName={equipment.name} onResolve={() => onResolve(n)} onChanged={onChanged} />)}
        </div>
      )}
    </Modal>
  );
}

function ResolveModal({ note, equipmentName, onClose, onSaved }: { note: EquipmentLog; equipmentName: string; onClose: () => void; onSaved: () => void }) {
  const { ensureActor, actorLeadId, actorName, toast } = useApp();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!ensureActor()) return;
    setSaving(true);
    const { error } = await supabase.rpc('resolve_equipment_issue', { p_log_id: note.id, p_lead_id: actorLeadId, p_notes: text.trim() || null });
    setSaving(false);
    if (error) return toast(errorMessage(error), 'error');
    toast(`Marked fixed: ${equipmentName}`);
    onSaved();
    onClose();
  }
  return (
    <Modal title={`Mark fixed: ${equipmentName}`} onClose={onClose}>
      <div className="issue"><span>{note.notes}</span><span className="meta">Posted {formatDateTime(note.logged_at)} by {note.performed_by_name}</span></div>
      <label className="field" style={{ marginTop: 16 }}>
        <span>How was it fixed? (optional)</span>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Tech replaced the thermostat" />
      </label>
      <button className="btn btn-primary btn-block" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Mark fixed'}</button>
      <p className="muted small center">{actorName ? `Fixed by ${actorName}` : 'Choose the Shift Lead first'}</p>
    </Modal>
  );
}
