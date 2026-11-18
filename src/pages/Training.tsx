import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorMessage } from '../lib/supabase';
import { useRealtime } from '../lib/useRealtime';
import { usePositions } from '../lib/usePositions';
import type { PositionSignoff, TeamMember } from '../lib/types';
import Icon from '../components/Icon';
import { useConfirm } from '../components/Confirm';

type Status = PositionSignoff['status'] | null;
const NEXT: Record<string, Status> = { none: 'training', training: 'trained', trained: null };
const WORDS: Record<string, string> = { none: 'Not trained', training: 'In training', trained: 'Trained' };

export function useTraining() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [signoffs, setSignoffs] = useState<PositionSignoff[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const [m, s] = await Promise.all([
      supabase.from('team_members').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('position_signoffs').select('*'),
    ]);
    setMembers((m.data as TeamMember[]) ?? []);
    setSignoffs((s.data as PositionSignoff[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['team_members', 'position_signoffs'], load);
  return { members, signoffs, loading, reload: load };
}

export default function Training() {
  const { isManager, isAdmin, toast } = useApp();
  const { positions, loading: loadingPositions } = usePositions();
  const { members, signoffs, loading, reload } = useTraining();
  const confirm = useConfirm();
  const [name, setName] = useState('');

  const find = (m: string, p: string) => signoffs.find((s) => s.member_id === m && s.position_id === p);
  const trainedCount = (p: string) => members.filter((m) => find(m.id, p)?.status === 'trained').length;

  async function cycle(m: TeamMember, positionId: string) {
    const cur = find(m.id, positionId);
    const next = NEXT[cur?.status ?? 'none'];
    const { error } = next
      ? await supabase.from('position_signoffs').upsert({ member_id: m.id, position_id: positionId, status: next, updated_at: new Date().toISOString() }, { onConflict: 'member_id,position_id' })
      : await supabase.from('position_signoffs').delete().eq('id', cur!.id);
    if (error) toast(errorMessage(error), 'error');
    reload();
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (members.some((m) => m.name.toLowerCase() === n.toLowerCase())) return toast(`${n} is already on the list`, 'error');
    const { error } = await supabase.from('team_members').insert({ name: n, sort_order: members.reduce((x, m) => Math.max(x, m.sort_order), 0) + 1 });
    if (error) return toast(errorMessage(error), 'error');
    setName('');
    reload();
  }

  async function remove(m: TeamMember) {
    if (!(await confirm({ title: `Take ${m.name} off the list?`, body: 'Use this when someone leaves the team. Their sign-offs are removed too.', confirmLabel: 'Remove', danger: true }))) return;
    const { error } = await supabase.from('team_members').delete().eq('id', m.id);
    if (error) return toast(errorMessage(error), 'error');
    reload();
  }

  return (
    <div className="page sec-training">
      <div className="page-title">
        <span className="page-icon"><Icon name="users" size={22} /></span>
        <h1>Who’s Trained</h1>
      </div>
      <p className="muted lede">
        Who can run each position. {isManager ? 'Tap a box to change it: in training, then trained, then blank.' : 'HOH Leads, directors and admins keep this up to date.'}
      </p>
      <div className="legend">
        <span><i className="sign sign-trained"><Icon name="done" size={14} /></i> Trained</span>
        <span><i className="sign sign-training"><Icon name="clock" size={14} /></i> In training</span>
        <span><i className="sign sign-none" /> Not trained</span>
      </div>

      {loading || loadingPositions ? (
        <div className="spinner" />
      ) : positions.length === 0 ? (
        <div className="empty">No positions yet. {isAdmin ? <Link to="/setup?tab=positions">Add them in Setup → Positions.</Link> : 'An admin can add them in Setup → Positions.'}</div>
      ) : (
        <section className="card training-card">
          <div className="training-scroll">
            <table className="training-table">
              <thead>
                <tr>
                  <th scope="col">Team member</th>
                  {positions.map((p) => (
                    <th key={p.id} scope="col">
                      {p.name}
                      <small>{trainedCount(p.id)} trained</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <th scope="row">
                      <span className="training-name">
                        {m.name}
                        {isManager && <button className="icon-btn sm" onClick={() => remove(m)} aria-label={`Remove ${m.name}`}><Icon name="x" size={14} /></button>}
                      </span>
                    </th>
                    {positions.map((p) => {
                      const status = find(m.id, p.id)?.status ?? 'none';
                      const label = `${m.name}, ${p.name}: ${WORDS[status]}`;
                      const mark = (
                        <i className={`sign sign-${status}`}>
                          {status === 'trained' && <Icon name="done" size={16} />}
                          {status === 'training' && <Icon name="clock" size={16} />}
                        </i>
                      );
                      return (
                        <td key={p.id}>
                          {isManager ? (
                            <button className="sign-btn" onClick={() => cycle(m, p.id)} aria-label={label} title={label}>{mark}</button>
                          ) : (
                            <span role="img" aria-label={label} title={label}>{mark}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr><td colSpan={positions.length + 1} className="muted training-empty">No team members on the list yet.{isManager && ' Add the first one below.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {isManager && (
            <form className="add-row" onSubmit={add}>
              <input placeholder="Add a team member’s name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Team member's name" />
              <button className="btn btn-primary" disabled={!name.trim()}><Icon name="plus" size={18} /> Add</button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
