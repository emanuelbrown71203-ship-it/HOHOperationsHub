import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../lib/app';
import { supabase, errorMessage } from '../lib/supabase';
import { useRealtime } from '../lib/useRealtime';
import { addDays, formatDay, timeAgo, weekStart } from '../lib/dates';
import type { Shoutout, WeeklyFocus } from '../lib/types';
import Icon from './Icon';
import Modal from './Modal';
import { useConfirm } from './Confirm';

/* ---------------- Focus of the week ---------------- */
export function FocusCard() {
  const { today, isManager, toast } = useApp();
  const week = weekStart(today);
  const [focus, setFocus] = useState<WeeklyFocus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('weekly_focus').select('*').eq('week_start', week).maybeSingle();
    setFocus((data as WeeklyFocus) ?? null);
    setLoaded(true);
  }, [week]);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['weekly_focus'], load);

  async function save() {
    if (!text.trim()) return toast('Write the focus first', 'error');
    const { error } = focus
      ? await supabase.from('weekly_focus').update({ focus: text.trim(), updated_at: new Date().toISOString() }).eq('week_start', week)
      : await supabase.from('weekly_focus').insert({ week_start: week, focus: text.trim() });
    if (error) return toast(errorMessage(error), 'error');
    toast('Focus of the week saved');
    setEditing(false);
    load();
  }

  if (!loaded) return <section className="focus-card"><div className="spinner" /></section>;
  if (!focus && !isManager) return null;

  return (
    <section className="focus-card">
      <div className="focus-head">
        <span className="focus-badge"><Icon name="target" size={18} /> Focus of the week</span>
        <span className="focus-week">Week of {formatDay(week)} – {formatDay(addDays(week, 6))}</span>
      </div>
      {editing ? (
        <div className="focus-edit">
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Hold times! Check the timer on every pan, every time." aria-label="Focus of the week" autoFocus />
          <div className="row-gap">
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={save}>Save focus</button>
          </div>
        </div>
      ) : focus ? (
        <>
          <p className="focus-text">{focus.focus}</p>
          <div className="focus-foot">
            <span>Set by {focus.created_by_name}</span>
            {isManager && (
              <button className="btn btn-sm btn-on-color" onClick={() => { setText(focus.focus); setEditing(true); }}>
                <Icon name="edit" size={15} /> Edit
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="focus-empty">
          <p>No focus set for this week yet.</p>
          <button className="btn btn-sm btn-on-color" onClick={() => { setText(''); setEditing(true); }}>
            <Icon name="plus" size={15} /> Set this week's focus
          </button>
        </div>
      )}
    </section>
  );
}

/* ---------------- Shoutouts ---------------- */
export function ShoutoutCard() {
  const { isManager, toast } = useApp();
  const confirm = useConfirm();
  const [items, setItems] = useState<Shoutout[]>([]);
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('shoutouts').select('*').order('created_at', { ascending: false }).limit(5);
    setItems((data as Shoutout[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['shoutouts'], load);

  const [latest, ...earlier] = items;
  if (!latest && !isManager) return null;

  async function remove(s: Shoutout) {
    if (!(await confirm({ title: 'Remove this shoutout?', confirmLabel: 'Remove', danger: true }))) return;
    const { error } = await supabase.from('shoutouts').delete().eq('id', s.id);
    if (error) return toast(errorMessage(error), 'error');
    load();
  }

  return (
    <section className="shout-card">
      <div className="shout-head">
        <span className="shout-badge"><Icon name="megaphone" size={18} /> Shoutout</span>
        {isManager && (
          <button className="btn btn-sm btn-ghost" onClick={() => setComposing(true)}>
            <Icon name="plus" size={15} /> Give a shoutout
          </button>
        )}
      </div>
      {latest ? (
        <div className="shout-main">
          <span className="shout-avatar" aria-hidden="true">{latest.lead_name.slice(0, 1).toUpperCase()}</span>
          <div className="shout-body">
            <strong className="shout-name">{latest.lead_name}</strong>
            <p className="shout-msg">{latest.message}</p>
            <span className="muted small">From {latest.created_by_name} · {timeAgo(latest.created_at)}</span>
          </div>
          {isManager && <button className="icon-btn" onClick={() => remove(latest)} aria-label="Remove shoutout"><Icon name="trash" size={16} /></button>}
          <span className="confetti" aria-hidden="true" />
        </div>
      ) : (
        <p className="muted">Recognize an HOH Lead for great work. It shows here for the whole team.</p>
      )}
      {earlier.length > 0 && (
        <ul className="shout-earlier">
          {earlier.map((s) => (
            <li key={s.id}>
              <strong>{s.lead_name}</strong> <span className="muted">· {s.message}</span>
            </li>
          ))}
        </ul>
      )}
      {composing && <ShoutoutModal onClose={() => setComposing(false)} onSaved={load} />}
    </section>
  );
}

function ShoutoutModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { leads, toast } = useApp();
  const [leadId, setLeadId] = useState(leads[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const lead = leads.find((l) => l.id === leadId);

  async function save() {
    if (!lead) return toast('Choose an HOH Lead', 'error');
    if (!message.trim()) return toast('Write a message', 'error');
    setSaving(true);
    const { error } = await supabase.from('shoutouts').insert({ lead_id: lead.id, lead_name: lead.name, message: message.trim() });
    setSaving(false);
    if (error) return toast(errorMessage(error), 'error');
    toast(`Shoutout posted for ${lead.name}`);
    onSaved();
    onClose();
  }

  return (
    <Modal title="Give a shoutout" onClose={onClose}>
      {leads.length === 0 ? (
        <p className="muted">Add your HOH Leads in Setup first.</p>
      ) : (
        <>
          <div className="field">
            <span>Who?</span>
            <div className="chips">
              {leads.map((l) => (
                <button key={l.id} type="button" className={`chip ${leadId === l.id ? 'on' : ''}`} onClick={() => setLeadId(l.id)}>{l.name}</button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>Message</span>
            <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Crushed the Friday lunch rush and kept the line spotless." />
          </label>
          <button className="btn btn-primary btn-block" onClick={save} disabled={saving}>{saving ? 'Posting…' : 'Post shoutout'}</button>
        </>
      )}
    </Modal>
  );
}
