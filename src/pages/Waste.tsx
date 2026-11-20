import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useApp } from '../lib/app';
import { supabase, errorMessage } from '../lib/supabase';
import { useRealtime } from '../lib/useRealtime';
import { formatDateTime, formatTime } from '../lib/dates';
import { downloadCsv } from '../lib/csv';
import type { WasteEntry, WasteItem } from '../lib/types';
import RangePicker, { rangeTitle, useRange } from '../components/RangePicker';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import { useConfirm } from '../components/Confirm';
import { PhotoPicker, PhotoThumb } from '../components/Photo';
import { removeFiles, uploadFile } from '../lib/files';

export default function Waste() {
  const { today, shift, shiftNames, ensureActor, actorLeadId, actorName, toast, session, isManager, settings } = useApp();
  // Night waste photos: on the closing shift a photo is required (switch in Setup → Waste Log).
  const closing = shiftNames[shiftNames.length - 1];
  const photoRequired = settings.waste_photo_at_close && shift === closing;
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) return setPreview(null);
    const u = URL.createObjectURL(photo);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);
  const confirm = useConfirm();
  const [editing, setEditing] = useState<WasteEntry | null>(null);

  /* ---- form ---- */
  const [presets, setPresets] = useState<WasteItem[]>([]);
  const [item, setItem] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('each');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('waste_items')
      .select('*')
      .eq('active', true)
      .order('sort_order')
      .order('name')
      .then(({ data }) => setPresets((data as WasteItem[]) ?? []));
  }, []);

  function pickPreset(p: WasteItem) {
    setItem(p.name);
    setUnit(p.default_unit);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ensureActor()) return;
    const qty = Number(quantity);
    if (!item.trim()) return toast('Choose or type an item', 'error');
    if (!(qty > 0)) return toast('Enter a quantity greater than 0', 'error');
    if (!reason) return toast('Choose a reason', 'error');
    if (photoRequired && !photo) return toast(`Take a photo of the waste first (required on the ${shift} shift)`, 'error');
    setSaving(true);
    let photo_path: string | null = null;
    try {
      if (photo) photo_path = (await uploadFile(`waste/${today}`, photo)).path;
      const { error } = await supabase.from('waste_entries').insert({
        item_name: item.trim(),
        quantity: qty,
        unit,
        reason,
        notes: notes.trim() || null,
        shift,
        log_date: today,
        lead_id: actorLeadId,
        photo_path,
      });
      if (error) throw error;
    } catch (err) {
      if (photo_path) await removeFiles([photo_path]);
      setSaving(false);
      return toast(errorMessage(err), 'error');
    }
    setSaving(false);
    toast(`Logged ${qty} ${unit} ${item.trim()}`);
    setItem('');
    setQuantity('1');
    setReason('');
    setNotes('');
    setPhoto(null);
    load();
  }

  /* ---- history ---- */
  const range = useRange(today, 'today');
  const [entries, setEntries] = useState<WasteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { from, to } = range;

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('waste_entries')
      .select('*')
      .gte('log_date', from)
      .lte('log_date', to)
      .order('logged_at', { ascending: false })
      .limit(1000);
    if (error) toast(errorMessage(error), 'error');
    setEntries((data as WasteEntry[]) ?? []);
    setLoading(false);
  }, [from, to, toast]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['waste_entries'], load);
  const tonightPhotos = entries.filter((e) => e.log_date === today && e.shift === closing && e.photo_path).length;

  const totals = useMemo(() => {
    const byItem = new Map<string, { item: string; unit: string; qty: number; count: number }>();
    const byReason = new Map<string, number>();
    for (const e of entries) {
      const k = `${e.item_name}|${e.unit}`;
      const cur = byItem.get(k) ?? { item: e.item_name, unit: e.unit, qty: 0, count: 0 };
      cur.qty += Number(e.quantity);
      cur.count += 1;
      byItem.set(k, cur);
      byReason.set(e.reason, (byReason.get(e.reason) ?? 0) + 1);
    }
    return {
      items: [...byItem.values()].sort((a, b) => b.count - a.count || b.qty - a.qty),
      reasons: [...byReason.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [entries]);

  async function remove(e: WasteEntry) {
    if (!(await confirm({ title: 'Delete this entry?', body: `${e.quantity} ${e.unit} ${e.item_name}, logged by ${e.performed_by_name}.`, confirmLabel: 'Delete', danger: true }))) return;
    const { error } = await supabase.from('waste_entries').delete().eq('id', e.id);
    if (error) return toast(errorMessage(error), 'error');
    toast('Entry deleted');
    load();
  }

  function exportCsv() {
    downloadCsv(
      `waste-${from}${from !== to ? `-to-${to}` : ''}.csv`,
      ['Date', 'Time', 'Shift', 'Item', 'Quantity', 'Unit', 'Reason', 'Notes', 'Logged by'],
      entries.map((e) => [e.log_date, formatTime(e.logged_at), e.shift, e.item_name, e.quantity, e.unit, e.reason, e.notes, e.performed_by_name]),
    );
  }

  return (
    <div className="page sec-waste">
      <div className="page-title">
        <span className="page-icon"><Icon name="trash" size={22} /></span>
        <h1>Waste Log</h1>
      </div>

      {photoRequired && (
        <div className={`banner ${tonightPhotos ? 'banner-ok' : 'banner-warn'}`}>
          <Icon name={tonightPhotos ? 'done' : 'camera'} />
          <span>
            {tonightPhotos
              ? <><strong>Tonight’s waste: {tonightPhotos} photo{tonightPhotos === 1 ? '' : 's'} in.</strong> Keep adding one with each entry.</>
              : <><strong>Take a photo of the waste with every entry tonight.</strong> It’s required on the {shift} shift and counts toward the Shift Lead’s points.</>}
          </span>
        </div>
      )}

      <div className="two-col">
        <form className="card" onSubmit={submit}>
          <h2>Log waste</h2>

          <div className="field">
            <span>Item</span>
            <div className="chips">
              {presets.map((p) => (
                <button type="button" key={p.id} className={`chip ${item === p.name ? 'on' : ''}`} onClick={() => pickPreset(p)}>
                  {p.name}
                </button>
              ))}
            </div>
            <input placeholder="Or type another item" value={item} onChange={(e) => setItem(e.target.value)} aria-label="Item" />
          </div>

          <div className="field-row">
            <label className="field">
              <span>Quantity</span>
              <div className="stepper">
                <button type="button" onClick={() => setQuantity(String(Math.max(1, (Number(quantity) || 0) - 1)))} aria-label="Decrease">−</button>
                <input type="number" inputMode="decimal" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                <button type="button" onClick={() => setQuantity(String((Number(quantity) || 0) + 1))} aria-label="Increase">+</button>
              </div>
            </label>
            <label className="field">
              <span>Unit</span>
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                {[...new Set([...settings.waste_units, unit])].map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="field">
            <span>Reason</span>
            <div className="chips">
              {settings.waste_reasons.map((r) => (
                <button type="button" key={r} className={`chip ${reason === r ? 'on' : ''}`} onClick={() => setReason(r)}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span>Notes (optional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <div className="field">
            <span>Photo of the waste {photoRequired ? '(required tonight)' : '(optional)'}</span>
            <div className="row-gap wrap">
              {preview && <img className="photo-preview" src={preview} alt="" />}
              <PhotoPicker onFiles={(f) => setPhoto(f[0])} multiple={false} className={photoRequired && !photo ? 'btn btn-primary' : 'btn btn-ghost'}>
                {photo ? 'Retake photo' : 'Take a photo'}
              </PhotoPicker>
              {photo && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPhoto(null)}>Remove</button>}
            </div>
          </div>

          <button className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Saving…' : 'Log waste'}
          </button>
          <p className="muted small center">
            {shift} shift · {actorName ? `Logged as ${actorName}` : 'Choose the Shift Lead first'}
          </p>
        </form>

        <div className="stack">
          <div className="row-between wrap">
            <RangePicker range={range} />
            <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={entries.length === 0}>
              <Icon name="download" size={16} /> Export CSV
            </button>
          </div>

          <section className="card">
            <h2>Summary · {rangeTitle(range.key)}</h2>
            {totals.items.length === 0 ? (
              <p className="muted">No waste logged.</p>
            ) : (
              <>
                <table className="table">
                  <thead>
                    <tr><th>Item</th><th className="num">Total</th><th className="num">Entries</th></tr>
                  </thead>
                  <tbody>
                    {totals.items.map((t) => (
                      <tr key={`${t.item}|${t.unit}`}>
                        <td>{t.item}</td>
                        <td className="num">{+t.qty.toFixed(2)} {t.unit}</td>
                        <td className="num">{t.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="reason-bars">
                  {totals.reasons.map(([r, n]) => (
                    <div key={r} className="reason-bar">
                      <span>{r}</span>
                      <div className="bar"><div style={{ width: `${(n / entries.length) * 100}%` }} /></div>
                      <span className="num">{n}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="card">
            <h2>Entries</h2>
            {loading ? (
              <div className="spinner" />
            ) : entries.length === 0 ? (
              <p className="muted">Nothing here yet.</p>
            ) : (
              <ul className="entries">
                {entries.map((e) => {
                  const canDelete = e.user_id === session?.user.id || isManager;
                  return (
                    <li key={e.id} className="entry">
                      {e.photo_path && <PhotoThumb path={e.photo_path} label={`${e.item_name}, ${formatDateTime(e.logged_at)}`} />}
                      <div className="entry-main">
                        <strong>{+Number(e.quantity).toFixed(2)} {e.unit} · {e.item_name}</strong>
                        <span className="muted small">
                          {e.reason}{e.notes ? ` — ${e.notes}` : ''}
                        </span>
                        <span className="muted small">
                          {range.key === 'today' ? formatTime(e.logged_at) : formatDateTime(e.logged_at)} · {e.shift} · {e.performed_by_name}
                        </span>
                      </div>
                      {canDelete && (
                        <div className="entry-actions">
                          <button className="icon-btn" onClick={() => setEditing(e)} aria-label="Edit entry">
                            <Icon name="edit" size={18} />
                          </button>
                          <button className="icon-btn" onClick={() => remove(e)} aria-label="Delete entry">
                            <Icon name="trash" size={18} />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
      {editing && <EditWaste entry={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

function EditWaste({ entry, onClose, onSaved }: { entry: WasteEntry; onClose: () => void; onSaved: () => void }) {
  const { settings, toast } = useApp();
  const [item, setItem] = useState(entry.item_name);
  const [quantity, setQuantity] = useState(String(entry.quantity));
  const [unit, setUnit] = useState(entry.unit);
  const [reason, setReason] = useState(entry.reason);
  const [notes, setNotes] = useState(entry.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const qty = Number(quantity);
    if (!item.trim()) return toast('Enter an item', 'error');
    if (!(qty > 0)) return toast('Enter a quantity greater than 0', 'error');
    setSaving(true);
    const { error } = await supabase
      .from('waste_entries')
      .update({ item_name: item.trim(), quantity: qty, unit, reason, notes: notes.trim() || null })
      .eq('id', entry.id);
    setSaving(false);
    if (error) return toast(errorMessage(error), 'error');
    toast('Entry updated');
    onSaved();
    onClose();
  }

  return (
    <Modal title="Edit waste entry" onClose={onClose}>
      <form onSubmit={save}>
        <label className="field">
          <span>Item</span>
          <input value={item} onChange={(e) => setItem(e.target.value)} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Quantity</span>
            <input type="number" inputMode="decimal" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <label className="field">
            <span>Unit</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              {[...new Set([...settings.waste_units, unit])].map((u) => <option key={u}>{u}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Reason</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {[...new Set([...settings.waste_reasons, reason])].map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <p className="muted small">Logged {formatDateTime(entry.logged_at)} by {entry.performed_by_name}. The name on an entry can't be changed.</p>
        <button className="btn btn-primary btn-block" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      </form>
    </Modal>
  );
}
