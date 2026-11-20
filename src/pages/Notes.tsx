import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorMessage } from '../lib/supabase';
import { useRealtime } from '../lib/useRealtime';
import { formatDateTime, timeAgo } from '../lib/dates';
import { removeFiles, uploadFile } from '../lib/files';
import type { KitchenRequest } from '../lib/types';
import Modal from '../components/Modal';
import Icon from '../components/Icon';
import { PhotoPicker, PhotoThumb } from '../components/Photo';
import { useConfirm } from '../components/Confirm';

export type RequestKind = KitchenRequest['kind'];
export const KIND: Record<RequestKind, { label: string; post: string; done: string; icon: 'wrench' | 'box' }> = {
  broken: { label: 'Broken', post: 'Something’s broken', done: 'Fixed', icon: 'wrench' },
  need: { label: 'Needed', post: 'We need something', done: 'Got it', icon: 'box' },
};

/** Equipment & Supplies posts, kept live: everything open, plus what was taken care of in the last two weeks. */
export function useKitchenRequests() {
  const [open, setOpen] = useState<KitchenRequest[]>([]);
  const [done, setDone] = useState<KitchenRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const since = new Date(Date.now() - 14 * 864e5).toISOString();
    const [o, d] = await Promise.all([
      supabase.from('kitchen_requests').select('*').eq('status', 'open').order('created_at', { ascending: false }),
      supabase.from('kitchen_requests').select('*').eq('status', 'done').gte('resolved_at', since).order('resolved_at', { ascending: false }).limit(30),
    ]);
    setOpen((o.data as KitchenRequest[]) ?? []);
    setDone((d.data as KitchenRequest[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['kitchen_requests'], load);
  return { open, done, loading, reload: load };
}

export default function Supplies() {
  const [params, setParams] = useSearchParams();
  const { open, done, loading, reload } = useKitchenRequests();
  const [resolving, setResolving] = useState<KitchenRequest | null>(null);
  const newKind = params.get('new');
  const composing: RequestKind | null = newKind === 'need' ? 'need' : newKind ? 'broken' : null;
  const setNew = (k: RequestKind | null) => {
    const next = new URLSearchParams(params);
    if (k) next.set('new', k);
    else next.delete('new');
    setParams(next, { replace: true });
  };
  const broken = open.filter((r) => r.kind === 'broken');
  const needed = open.filter((r) => r.kind === 'need');

  return (
    <div className="page sec-notes">
      <div className="page-title">
        <span className="page-icon"><Icon name="wrench" size={22} /></span>
        <h1>Equipment &amp; Supplies</h1>
      </div>
      <p className="muted lede">Pass the message along: something broken, or something the kitchen needs, like oven mitts or a scraper. It stays here until someone takes care of it.</p>

      <div className="post-buttons">
        <button className="post-btn kind-broken" onClick={() => setNew('broken')}>
          <span className="quick-icon"><Icon name="wrench" size={22} /></span>
          <span><strong>Something’s broken</strong><small>Equipment not working right</small></span>
        </button>
        <button className="post-btn kind-need" onClick={() => setNew('need')}>
          <span className="quick-icon"><Icon name="box" size={22} /></span>
          <span><strong>We need something</strong><small>Oven mitts, scrapers, supplies</small></span>
        </button>
      </div>

      {loading ? (
        <div className="spinner" />
      ) : (
        <>
          <div className="dash-grid">
            <section className="stack">
              <h2 className="section-title"><span className="dot dot-danger" /> Broken ({broken.length})</h2>
              {broken.length === 0 ? <div className="all-clear"><Icon name="done" size={18} /> Nothing broken right now</div> : (
                <div className="request-list">{broken.map((r) => <RequestCard key={r.id} request={r} onResolve={() => setResolving(r)} onChanged={reload} />)}</div>
              )}
            </section>
            <section className="stack">
              <h2 className="section-title"><span className="dot dot-warn" /> Needed ({needed.length})</h2>
              {needed.length === 0 ? <div className="all-clear"><Icon name="done" size={18} /> Nothing needed right now</div> : (
                <div className="request-list">{needed.map((r) => <RequestCard key={r.id} request={r} onResolve={() => setResolving(r)} onChanged={reload} />)}</div>
              )}
            </section>
          </div>

          {done.length > 0 && (
            <section className="stack">
              <h2 className="section-title">Taken care of (last 2 weeks)</h2>
              <div className="card">
                <ul className="entries">
                  {done.map((r) => (
                    <li key={r.id} className="entry">
                      <span className="fixed-check"><Icon name="done" size={16} /></span>
                      <div className="entry-main">
                        <strong>{r.title}</strong>
                        <span className="muted small">
                          {KIND[r.kind].done} by {r.resolved_by_name}{r.resolved_at ? `, ${timeAgo(r.resolved_at)}` : ''}
                          {r.resolution_note ? ` · ${r.resolution_note}` : ''}
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

      {composing && <NewRequestModal kind={composing} onKind={setNew} onClose={() => setNew(null)} onSaved={reload} />}
      {resolving && <ResolveModal request={resolving} onClose={() => setResolving(null)} onSaved={reload} />}
    </div>
  );
}

export function RequestCard({ request: r, onResolve, onChanged, compact }: { request: KitchenRequest; onResolve?: () => void; onChanged?: () => void; compact?: boolean }) {
  const { session, isManager, toast } = useApp();
  const confirm = useConfirm();
  const canDelete = !compact && onChanged && (r.user_id === session?.user.id || isManager);
  async function remove() {
    if (!(await confirm({ title: 'Delete this post?', body: `Use “${KIND[r.kind].done}” instead if it was taken care of, so there’s a record.`, confirmLabel: 'Delete', danger: true }))) return;
    const { error } = await supabase.from('kitchen_requests').delete().eq('id', r.id);
    if (error) return toast(errorMessage(error), 'error');
    if (r.photo_path) await removeFiles([r.photo_path]);
    onChanged?.();
  }
  return (
    <article className={`request-card kind-${r.kind} ${compact ? 'compact' : ''}`}>
      <div className="request-top">
        <span className="request-kind"><Icon name={KIND[r.kind].icon} size={14} /> {KIND[r.kind].label}</span>
        <span className="muted small">{timeAgo(r.created_at)}</span>
      </div>
      <strong className="request-title">{r.title}</strong>
      {r.details && <p className="request-details">{r.details}</p>}
      {r.photo_path && !compact && <div className="photo-grid one"><PhotoThumb path={r.photo_path} label={r.title} /></div>}
      <div className="request-foot">
        <span className="muted small">{r.performed_by_name}{r.shift ? ` · ${r.shift} shift` : ''}</span>
        <div className="row-gap">
          {canDelete && <button className="icon-btn sm-lg" onClick={remove} aria-label="Delete post"><Icon name="trash" size={16} /></button>}
          {onResolve && <button className="btn btn-sm btn-fix" onClick={onResolve}><Icon name="done" size={16} /> {KIND[r.kind].done}</button>}
        </div>
      </div>
    </article>
  );
}

function NewRequestModal({ kind, onKind, onClose, onSaved }: { kind: RequestKind; onKind: (k: RequestKind) => void; onClose: () => void; onSaved: () => void }) {
  const { today, shift, ensureActor, actorLeadId, actorName, toast } = useApp();
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
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
    if (!title.trim()) return toast(kind === 'broken' ? 'Say what’s broken' : 'Say what you need', 'error');
    if (!ensureActor()) return;
    setSaving(true);
    try {
      const photo_path = photo ? (await uploadFile(`requests/${today}`, photo)).path : null;
      const { error } = await supabase.from('kitchen_requests').insert({ kind, title: title.trim(), details: details.trim() || null, photo_path, shift, lead_id: actorLeadId });
      if (error) throw error;
      toast(kind === 'broken' ? 'Posted. It stays up until someone marks it fixed.' : 'Posted. It stays up until someone marks it “Got it”.');
      onSaved();
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={kind === 'broken' ? 'Something’s broken' : 'We need something'} onClose={onClose}>
      <div className="segmented" role="radiogroup" aria-label="What kind of post">
        {(['broken', 'need'] as RequestKind[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => onKind(k)}>{KIND[k].post}</button>
        ))}
      </div>
      <label className="field">
        <span>{kind === 'broken' ? 'What’s broken?' : 'What do you need?'}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'broken' ? 'e.g. Fryer 3, or the walk-in door' : 'e.g. Oven mitts, a grill scraper'} autoFocus />
      </label>
      <label className="field">
        <span>Details (optional)</span>
        <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={kind === 'broken' ? 'e.g. Won’t come back up to temp after a drop' : 'e.g. Ours have holes, need 2 pairs'} />
      </label>
      <div className="field">
        <span>Photo (optional)</span>
        <div className="row-gap wrap">
          {preview && <img className="photo-preview" src={preview} alt="" />}
          <PhotoPicker onFiles={(f) => setPhoto(f[0])} multiple={false}>{photo ? 'Change photo' : 'Add a photo'}</PhotoPicker>
          {photo && <button className="btn btn-ghost btn-sm" onClick={() => setPhoto(null)}>Remove</button>}
        </div>
      </div>
      <button className="btn btn-primary btn-block" onClick={save} disabled={saving}>{saving ? 'Posting…' : 'Post it'}</button>
      <p className="muted small center">{shift} shift · {actorName ? `Posted as ${actorName}` : 'Choose the Shift Lead first'}</p>
    </Modal>
  );
}

function ResolveModal({ request: r, onClose, onSaved }: { request: KitchenRequest; onClose: () => void; onSaved: () => void }) {
  const { ensureActor, actorLeadId, actorName, toast } = useApp();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!ensureActor()) return;
    setSaving(true);
    const { error } = await supabase.rpc('resolve_kitchen_request', { p_id: r.id, p_lead_id: actorLeadId, p_note: text.trim() || null });
    setSaving(false);
    if (error) return toast(errorMessage(error), 'error');
    toast(`${KIND[r.kind].done}: ${r.title}`);
    onSaved();
    onClose();
  }
  return (
    <Modal title={`${KIND[r.kind].done}: ${r.title}`} onClose={onClose}>
      <div className="issue"><span>{r.details ?? r.title}</span><span className="meta">Posted {formatDateTime(r.created_at)} by {r.performed_by_name}</span></div>
      <label className="field" style={{ marginTop: 16 }}>
        <span>{r.kind === 'broken' ? 'How was it fixed?' : 'Where is it?'} (optional)</span>
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={r.kind === 'broken' ? 'e.g. Tech replaced the thermostat' : 'e.g. New mitts are on the shelf by the fryers'} />
      </label>
      <button className="btn btn-primary btn-block" onClick={save} disabled={saving}>{saving ? 'Saving…' : KIND[r.kind].done}</button>
      <p className="muted small center">{actorName ? `Marked by ${actorName}` : 'Choose the Shift Lead first'}</p>
    </Modal>
  );
}
