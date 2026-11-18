import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { useRealtime } from '../lib/useRealtime';
import { useChecklists } from '../lib/useChecklists';
import { addDays, formatClock, formatDay, formatTime, timeAgo } from '../lib/dates';
import { shiftTone } from '../lib/tone';
import { previousShift } from '../lib/handoff';
import { useSchedule } from '../lib/useSchedule';
import { fmtAvg, statsFor, streakFor, useScores } from '../lib/useScores';
import Ring from '../components/Ring';
import DayDot from '../components/DayDot';
import Icon, { type IconName } from '../components/Icon';
import Stars from '../components/Stars';
import { FocusCard, ShoutoutCard } from '../components/HomeCards';
import { ScoreboardBody } from '../components/ScoreboardCard';
import LeadOfMonthBanner from '../components/LeadOfMonth';
import { useFryers } from './Fryers';
import { NoteCard, useKitchenNotes } from './Notes';
import { useHandoffs } from './Handoff';

type HomeView = 'overview' | 'shift';
const VIEW_KEY = 'hoh.homeView';

function readView(): HomeView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'shift' ? 'shift' : 'overview';
  } catch {
    return 'overview';
  }
}

export default function Home() {
  const { canSchedule, profile } = useApp();
  const [view, setViewState] = useState<HomeView>(readView);
  const setView = (v: HomeView) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* per-device convenience only */
    }
  };
  const showOverview = canSchedule && view === 'overview';
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = (profile?.full_name ?? '').split(' ')[0];

  return (
    <div className="page sec-home">
      {canSchedule && (
        <div className="home-head">
          <h1>{hello}{first ? `, ${first}` : ''}</h1>
          <div className="segmented home-switch" role="tablist" aria-label="Home view">
            <button role="tab" aria-selected={showOverview} className={showOverview ? 'on' : ''} onClick={() => setView('overview')}>
              <Icon name="trophy" size={16} /> Overview
            </button>
            <button role="tab" aria-selected={!showOverview} className={!showOverview ? 'on' : ''} onClick={() => setView('shift')}>
              <Icon name="clock" size={16} /> Today’s shift
            </button>
          </div>
        </div>
      )}
      {showOverview ? <Overview onShiftView={() => setView('shift')} /> : <ShiftView />}
    </div>
  );
}

/* ================================================================== */
/* Running the shift: HOH Leads, team members, the store tablet        */
/* ================================================================== */
function ShiftView() {
  const { today, shift, shiftNames, settings, actorName, isKitchen, leads, myLeadId, canViewScores } = useApp();
  const { progress } = useChecklists(today);
  const { open: openIssues, nameOf } = useKitchenNotes(today);
  const { byKey, photosFor } = useHandoffs(today);
  const { fryers, due } = useFryers(today);
  const { entries, entryFor } = useSchedule(addDays(today, -1), addDays(today, 13));

  const tone = shiftTone(shiftNames, shift);
  const shiftDef = settings.shifts.find((s) => s.name === shift);
  const shiftIndex = shiftNames.indexOf(shift);
  const isClose = shiftIndex === shiftNames.length - 1;
  const leadName = (id?: string | null) => leads.find((l) => l.id === id)?.name ?? null;

  const mine = progress.filter((p) => (p.template.shift === shift || p.template.shift === 'Any') && p.total > 0);
  const done = mine.reduce((n, p) => n + p.done, 0);
  const total = mine.reduce((n, p) => n + p.total, 0);

  const prev = previousShift(today, shift, shiftNames);
  const prevHandoff = byKey.get(`${prev.date}|${prev.shift}`);
  const prevLeadId = prevHandoff?.lead_id ?? entryFor(prev.date, prev.shift)?.lead_id ?? null;
  const prevLead = prevHandoff?.lead_name ?? leadName(prevLeadId);
  const myHandoff = byKey.get(`${today}|${shift}`);
  const myPhotos = photosFor(myHandoff).length;

  /* ---- the to-do list for this shift ---- */
  const todos: Todo[] = [];
  if (!(myLeadId && prevLeadId === myLeadId)) {
    todos.push({
      key: 'rate',
      done: !!prevHandoff?.rated_at,
      icon: 'star',
      title: `Rate the ${prev.shift} shift’s setup`,
      sub: prevHandoff?.rated_at ? `Rated by ${prevHandoff.rated_by_name}` : prevLead ? `Shift Lead ${prevLead} · counts toward their score` : 'How did you find the kitchen when you came in?',
      to: '/handoff',
    });
  }
  for (const p of mine) {
    todos.push({
      key: p.template.id,
      done: p.done === p.total,
      icon: 'check',
      title: p.template.name,
      sub: p.done === p.total ? 'All tasks done' : `${p.done} of ${p.total} tasks${p.template.frequency === 'weekly' ? ' · this week' : ''}`,
      to: `/checklists/${p.template.id}`,
    });
  }
  if (fryers.length > 0) {
    todos.push({
      key: 'fryers',
      done: due.length === 0,
      icon: 'flame',
      title: due.length === 0 ? 'Fryers up to date' : `${due.length} fryer job${due.length === 1 ? '' : 's'} due`,
      sub: due.length === 0 ? 'Nothing is due to filter or change' : due.map((d) => `${d.fryer.name} ${d.job === 'filter_change' ? 'filter' : 'oil'}`).join(' · '),
      to: '/fryers',
    });
  }
  todos.push({
    key: 'handoff',
    done: !!myHandoff?.submitted_at,
    icon: 'camera',
    title: `${isClose ? 'Close-out' : 'Shift swap'} photos and notes`,
    sub: myHandoff?.submitted_at
      ? `Submitted by ${myHandoff.submitted_by_name} at ${formatTime(myHandoff.submitted_at)}`
      : `${myPhotos ? `${myPhotos} photo${myPhotos === 1 ? '' : 's'} so far` : 'Photos required'} · before you leave`,
    to: '/handoff',
  });

  const scheduled = shiftNames.map((s) => ({ shift: s, name: byKey.get(`${today}|${s}`)?.lead_name ?? leadName(entryFor(today, s)?.lead_id) }));
  const myNext = !isKitchen && myLeadId
    ? entries.filter((e) => e.lead_id === myLeadId && (e.shift_date > today || (e.shift_date === today && shiftNames.indexOf(e.shift) >= shiftIndex)))[0]
    : undefined;

  return (
    <>
      <section className={`hero tone-${tone}`}>
        <div className="hero-sky" aria-hidden="true"><span className="hero-sun" /></div>
        <div className="hero-main">
          <div className="hero-eyebrow">
            <span>{formatDay(today)}</span>
            <DayDot date={today} />
          </div>
          <h1 className="hero-title">{shift} shift</h1>
          <div className="hero-lead">
            <Icon name="user" size={18} />
            {actorName ? <span>{isKitchen ? 'Shift Lead' : 'Logging as'} <strong>{actorName}</strong></span> : <span>No Shift Lead selected</span>}
            {shiftDef && <span className="hero-since">· started {formatClock(shiftDef.start)}</span>}
          </div>
        </div>
        <Link to="/checklists" className="ticket">
          <span className="ticket-head">HOH Lead · {shift}</span>
          <Ring done={done} total={total} size={96} stroke={9} label={`${done} of ${total} tasks`} />
          <span className="ticket-count"><b>{done}</b> of {total} tasks</span>
        </Link>
      </section>

      <Link to="/schedule" className="today-leads" aria-label="Today's Shift Leads. Open the schedule.">
        <span className="eyebrow"><Icon name="calendar" size={14} /> Today’s Shift Leads</span>
        {scheduled.map((s) => (
          <span key={s.shift} className={`today-lead ${s.shift === shift ? 'now' : ''}`}>{s.shift} <strong>{s.name ?? 'Not set'}</strong></span>
        ))}
        {myNext && (
          <span className="today-lead mine">
            You lead next: <strong>{myNext.shift_date === today ? 'today' : myNext.shift_date === addDays(today, 1) ? 'tomorrow' : formatDay(myNext.shift_date)} {myNext.shift}</strong>
          </span>
        )}
        <Icon name="chevron" size={16} />
      </Link>

      <div className="dash-grid">
        <TodoCard todos={todos} />
        <div className="stack">
          <FocusCard />
          <ShoutoutCard />
        </div>
      </div>

      <LeadOfMonthBanner />

      <div className="dash-grid">
        <IssuesCard open={openIssues} nameOf={nameOf} />
        {canViewScores && !isKitchen && myLeadId && <MyScoreCard leadId={myLeadId} />}
      </div>
    </>
  );
}

interface Todo {
  key: string;
  done: boolean;
  icon: IconName;
  title: string;
  sub: string;
  to: string;
}

function TodoCard({ todos }: { todos: Todo[] }) {
  const left = todos.filter((t) => !t.done);
  const sorted = [...left, ...todos.filter((t) => t.done)];
  const doneCount = todos.length - left.length;
  return (
    <section className="card todo-card sec-checklists">
      <div className="card-head">
        <h2><span className="dot" />This shift</h2>
        <span className={`todo-count ${left.length === 0 ? 'all' : ''}`}>{left.length === 0 ? 'All done' : `${doneCount} of ${todos.length} done`}</span>
      </div>
      <div className="todo-bar" aria-hidden="true"><span style={{ width: `${(doneCount / Math.max(1, todos.length)) * 100}%` }} /></div>
      <ul className="todo-list">
        {sorted.map((t) => (
          <li key={t.key}>
            <Link to={t.to} className={`todo-row ${t.done ? 'done' : ''}`}>
              <span className="todo-icon" aria-hidden="true"><Icon name={t.done ? 'done' : t.icon} size={18} /></span>
              <span className="todo-text">
                <strong>{t.title}</strong>
                <small>{t.sub}</small>
              </span>
              <span className="sr-only">{t.done ? 'Done' : 'To do'}</span>
              <Icon name="chevron" size={18} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function IssuesCard({ open, nameOf }: { open: ReturnType<typeof useKitchenNotes>['open']; nameOf: (id: string) => string }) {
  return (
    <section className="card sec-notes notes-panel">
      <div className="card-head">
        <h2><span className="dot dot-danger" />Equipment issues{open.length > 0 && ` (${open.length})`}</h2>
        <Link to="/notes" className="link-more">See all <Icon name="chevron" size={16} /></Link>
      </div>
      {open.length === 0 ? (
        <div className="all-clear"><Icon name="done" size={18} /> Nothing broken right now</div>
      ) : (
        <div className="note-board compact">
          {open.slice(0, 2).map((n) => <NoteCard key={n.id} note={n} equipmentName={nameOf(n.equipment_id)} compact />)}
          {open.length > 2 && <Link to="/notes" className="link-more">+{open.length - 2} more</Link>}
        </div>
      )}
      <Link to="/notes?new=1" className="btn btn-ghost btn-block"><Icon name="plus" size={18} /> Report an equipment issue</Link>
    </section>
  );
}

/** A lead's own score, for HOH Leads allowed to see scores. */
function MyScoreCard({ leadId }: { leadId: string }) {
  const { today, shift } = useApp();
  const { records, shifts, loading } = useScores();
  if (loading) return null;
  const s = statsFor(leadId, records, shifts, '30d', today, { date: today, shift });
  const streak = streakFor(leadId, records);
  const latest = records.filter((r) => r.lead_id === leadId).sort((a, b) => b.rated_at.localeCompare(a.rated_at))[0];
  return (
    <Link to={`/scores/${leadId}`} className="card my-score sec-scores">
      <span className="eyebrow">Your lead score · last 30 days</span>
      <span className="my-score-row">
        <span className="stat-value">{fmtAvg(s.avg)}<small>/ 5</small></span>
        <span className="muted small">{s.count} rating{s.count === 1 ? '' : 's'}</span>
        {streak >= 3 && <span className="streak"><Icon name="flame" size={12} /> {streak} in a row at 4+</span>}
      </span>
      {latest && (
        <span className="my-score-latest">
          <Stars value={latest.rating} size="sm" /> {latest.shift} shift, {formatDay(latest.shift_date)}{latest.comment ? ` · “${latest.comment}”` : ''}
        </span>
      )}
    </Link>
  );
}

/* ================================================================== */
/* Managing: directors and admins                                      */
/* ================================================================== */
function usePendingCount(enabled: boolean) {
  const [n, setN] = useState(0);
  const load = useCallback(async () => {
    if (!enabled) return;
    const { data } = await supabase.from('profiles').select('id').eq('role', 'pending');
    setN((data ?? []).length);
  }, [enabled]);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime(enabled ? ['profiles'] : [], load);
  return n;
}

interface Attention {
  key: string;
  level: 'danger' | 'warn';
  icon: IconName;
  title: string;
  sub?: string;
  to: string;
}

function Overview({ onShiftView }: { onShiftView: () => void }) {
  const { today, shift, shiftNames, settings, leads, isAdmin } = useApp();
  const scores = useScores();
  const { entries, entryFor } = useSchedule(addDays(today, -7), addDays(today, 6));
  const { open: openIssues, nameOf } = useKitchenNotes(today);
  const { due } = useFryers(today);
  const { byKey, ratingFor } = useHandoffs(today);
  const { progress } = useChecklists(today);
  const pending = usePendingCount(isAdmin);
  const leadName = (id?: string | null) => leads.find((l) => l.id === id)?.name ?? null;
  const shiftIndex = shiftNames.indexOf(shift);
  const prev = previousShift(today, shift, shiftNames);

  /* ---- what needs attention ---- */
  const items: Attention[] = [];
  if (pending > 0) {
    items.push({ key: 'pending', level: 'warn', icon: 'user', title: `${pending} ${pending === 1 ? 'person is' : 'people are'} waiting for approval`, sub: 'Give them a role in Setup → People', to: '/setup?tab=team' });
  }
  const missing: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    shiftNames.forEach((s, j) => {
      if (d === today && j < shiftIndex) return;
      if (!entryFor(d, s)) missing.push(`${d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : formatDay(d).split(',')[0]} ${s}`);
    });
  }
  if (missing.length) {
    items.push({ key: 'sched', level: missing[0].startsWith('Today') ? 'danger' : 'warn', icon: 'calendar', title: `${missing.length} shift${missing.length === 1 ? '' : 's'} this week with no Shift Lead`, sub: missing.slice(0, 4).join(', ') + (missing.length > 4 ? '…' : ''), to: '/schedule' });
  }
  const unsent = entries.filter((e) => e.shift_date >= today && !e.notified_at).length;
  if (settings.notifications_enabled && unsent > 0) {
    items.push({ key: 'unsent', level: 'warn', icon: 'bell', title: `Schedule not sent for ${unsent} shift${unsent === 1 ? '' : 's'}`, sub: 'Send it so each lead hears about their shifts', to: '/schedule' });
  }
  if (due.length) {
    items.push({ key: 'fryers', level: 'danger', icon: 'flame', title: `${due.length} fryer job${due.length === 1 ? '' : 's'} overdue`, sub: due.map((d) => `${d.fryer.name} ${d.job === 'filter_change' ? 'filter' : 'oil'}`).join(' · '), to: '/fryers' });
  }
  if (openIssues.length) {
    const oldest = openIssues[openIssues.length - 1];
    items.push({ key: 'issues', level: 'warn', icon: 'wrench', title: `${openIssues.length} equipment issue${openIssues.length === 1 ? '' : 's'} open`, sub: `Oldest: ${nameOf(oldest.equipment_id)}, reported ${timeAgo(oldest.logged_at)}`, to: '/notes' });
  }
  let notSubmitted = 0;
  let notRated = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, -i);
    shiftNames.forEach((s, j) => {
      if (d === today && j >= shiftIndex) return; // still running or not started
      const h = byKey.get(`${d}|${s}`);
      if (!h && !entryFor(d, s)) return; // nobody ran this shift in the app
      if (!h?.submitted_at) notSubmitted++;
      if (!h?.rated_at && !(d === prev.date && s === prev.shift)) notRated++;
    });
  }
  if (notSubmitted) items.push({ key: 'handoffs', level: 'warn', icon: 'camera', title: `${notSubmitted} handoff${notSubmitted === 1 ? '' : 's'} not submitted in the last 7 days`, sub: 'No photos or notes were left for the next shift', to: '/handoff' });
  if (notRated) items.push({ key: 'rated', level: 'warn', icon: 'star', title: `${notRated} shift${notRated === 1 ? '' : 's'} not rated in the last 7 days`, sub: 'The incoming shift didn’t rate the setup', to: '/handoff' });
  for (const l of scores.leads) {
    const s = statsFor(l.id, scores.records, scores.shifts, '30d', today, { date: today, shift });
    if (s.avg !== null && s.avg < 3 && s.count >= 3) {
      items.push({ key: `low-${l.id}`, level: 'danger', icon: 'alert', title: `${l.name} is averaging ${s.avg.toFixed(1)} stars`, sub: `${s.count} ratings in the last 30 days`, to: `/scores/${l.id}` });
    }
  }
  items.sort((a, b) => Number(b.level === 'danger') - Number(a.level === 'danger'));

  /* ---- today, shift by shift ---- */
  const todayRows = shiftNames.map((s, j) => {
    const h = byKey.get(`${today}|${s}`);
    const lead = h?.lead_name ?? leadName(entryFor(today, s)?.lead_id);
    const lists = progress.filter((p) => (p.template.shift === s || p.template.shift === 'Any') && p.total > 0 && p.template.frequency === 'daily');
    const d = lists.reduce((n, p) => n + p.done, 0);
    const t = lists.reduce((n, p) => n + p.total, 0);
    const r = ratingFor(h);
    const start = settings.shifts.find((x) => x.name === s)?.start;
    let state: ReactNode;
    if (j > shiftIndex) state = <span className="muted">Starts {start ? formatClock(start) : 'later'}</span>;
    else if (j === shiftIndex) state = <><span className="pill pill-accent">Now</span> <span className="muted">Checklists {d}/{t} · {h?.submitted_at ? 'handoff submitted' : 'handoff not yet'}</span></>;
    else state = <span className="muted">{h?.submitted_at ? 'Handoff submitted' : 'No handoff'} · {r ? <>rated {Number(r.score ?? r.rating).toFixed(1)}</> : h?.rated_at ? 'rated' : 'not rated yet'}</span>;
    return { s, lead, state };
  });

  return (
    <>
      <ScoreboardBody {...scores} />

      <div className="dash-grid">
        <section className="card attention-card">
          <div className="card-head">
            <h2><span className="dot dot-danger" />Needs attention</h2>
            {items.length > 0 && <span className="todo-count">{items.length}</span>}
          </div>
          {items.length === 0 ? (
            <div className="all-clear big"><Icon name="done" size={20} /> All clear. Nothing needs you right now.</div>
          ) : (
            <ul className="todo-list">
              {items.map((a) => (
                <li key={a.key}>
                  <Link to={a.to} className={`todo-row attn-${a.level}`}>
                    <span className="todo-icon" aria-hidden="true"><Icon name={a.icon} size={18} /></span>
                    <span className="todo-text">
                      <strong>{a.title}</strong>
                      {a.sub && <small>{a.sub}</small>}
                    </span>
                    <Icon name="chevron" size={18} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card today-card sec-schedule">
          <div className="card-head">
            <h2><span className="dot" />Today · {formatDay(today)}</h2>
            <Link to="/schedule" className="link-more">Schedule <Icon name="chevron" size={16} /></Link>
          </div>
          <ul className="today-shifts">
            {todayRows.map((r) => (
              <li key={r.s} className={`tone-${shiftTone(shiftNames, r.s)}`}>
                <span className="today-shift-name"><i className="shift-dot" aria-hidden="true" />{r.s}</span>
                <span className="today-shift-body">
                  <strong>{r.lead ?? 'No Shift Lead'}</strong>
                  <small>{r.state}</small>
                </span>
              </li>
            ))}
          </ul>
          <button className="btn btn-ghost btn-block" onClick={onShiftView}><Icon name="clock" size={18} /> Open today’s shift view</button>
        </section>
      </div>

      <LeadOfMonthBanner />

      <div className="home-top">
        <FocusCard />
        <ShoutoutCard />
      </div>
    </>
  );
}
