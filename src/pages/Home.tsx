import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
import DayDot from '../components/DayDot';
import Icon, { type IconName } from '../components/Icon';
import Stars from '../components/Stars';
import { FocusCard, ShoutoutCard } from '../components/HomeCards';
import { ScoreboardBody } from '../components/ScoreboardCard';
import LeadOfMonthBanner from '../components/LeadOfMonth';
import { celebrate } from '../components/Celebrate';
import { useCleaning } from '../lib/useCleaning';
import { RequestCard, useKitchenRequests } from './Notes';
import { NoteCard as CoachNoteCard, followUpDue, useCoachingNotes } from './Coaching';
import type { KitchenRequest } from '../lib/types';
import { useHandoffs } from './Handoff';

type HomeView = 'overview' | 'shift';
// Everyone opens on the shift; directors and admins can switch to the Overview (remembered per device).
const VIEW_KEY = 'hoh.homeView2';

function readView(): HomeView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'overview' ? 'overview' : 'shift';
  } catch {
    return 'shift';
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
            <button role="tab" aria-selected={!showOverview} className={!showOverview ? 'on' : ''} onClick={() => setView('shift')}>
              <Icon name="clock" size={16} /> Today’s shifts
            </button>
            <button role="tab" aria-selected={showOverview} className={showOverview ? 'on' : ''} onClick={() => setView('overview')}>
              <Icon name="trophy" size={16} /> Overview
            </button>
          </div>
        </div>
      )}
      {showOverview ? <Overview onShiftView={() => setView('shift')} /> : <ShiftView />}
    </div>
  );
}

/* ================================================================== */
/* Shift ready: what the AM and PM shifts must get done today          */
/* ================================================================== */
interface Req {
  key: string;
  done: boolean;
  icon: IconName;
  title: string;
  sub: string;
  to: string;
}

function ShiftView() {
  const { today, shift, shiftNames, settings, actorName, isKitchen, leads, myLeadId, canViewScores } = useApp();
  const { progress, loading: loadingLists } = useChecklists(today);
  const { open: requests } = useKitchenRequests();
  const { byKey, photosFor, loading: loadingHandoffs } = useHandoffs(today);
  const { entries, entryFor } = useSchedule(addDays(today, -1), addDays(today, 13));
  const { items: cleaning, loading: loadingCleaning } = useCleaning(today);
  const ready = !loadingLists && !loadingHandoffs && !loadingCleaning;

  const tone = shiftTone(shiftNames, shift);
  const current = shiftNames.indexOf(shift);
  const leadName = (id?: string | null) => leads.find((l) => l.id === id)?.name ?? null;
  const sorted = [...settings.shifts].sort((a, b) => a.start.localeCompare(b.start));

  const cards = shiftNames.map((s, j) => {
    const def = sorted.find((x) => x.name === s);
    const next = sorted[sorted.findIndex((x) => x.name === s) + 1];
    const endsAt = next ? next.start : settings.close_time;
    const isClose = j === shiftNames.length - 1;
    const h = byKey.get(`${today}|${s}`);
    const lead = h?.lead_name ?? leadName(entryFor(today, s)?.lead_id);
    const prev = previousShift(today, s, shiftNames);
    const prevH = byKey.get(`${prev.date}|${prev.shift}`);
    const photos = photosFor(h).length;

    const reqs: Req[] = [];
    reqs.push({
      key: 'rate',
      done: !!prevH?.rated_at,
      icon: 'star',
      title: `Rate the ${prev.shift} shift’s setup`,
      sub: prevH?.rated_at ? `Rated by ${prevH.rated_by_name}` : `${prev.date === today ? 'This morning' : 'Last night'}${prevH?.lead_name ? ` · led by ${prevH.lead_name}` : ''}`,
      to: '/handoff',
    });
    for (const p of progress.filter((x) => x.template.shift === s && x.total > 0)) {
      reqs.push({
        key: p.template.id,
        done: p.done === p.total,
        icon: 'check',
        title: p.template.name,
        sub: p.done === p.total ? 'All tasks done' : `${p.done} of ${p.total} tasks${p.template.frequency === 'weekly' ? ' · this week' : ''}`,
        to: `/checklists/${p.template.id}`,
      });
    }
    const jobs = cleaning.filter((i) => i.task.shift === s && i.status !== 'later');
    if (jobs.length) {
      const jobsDone = jobs.filter((i) => i.status === 'done').length;
      const late = jobs.filter((i) => i.status === 'overdue').length;
      reqs.push({
        key: 'cleaning',
        done: jobsDone === jobs.length,
        icon: 'broom',
        title: 'Cleaning',
        sub: jobsDone === jobs.length ? 'All cleaning jobs done' : `${jobsDone} of ${jobs.length} jobs done${late ? ` · ${late} overdue` : ''}`,
        to: `/cleaning?shift=${encodeURIComponent(s)}`,
      });
    }
    reqs.push({
      key: 'handoff',
      done: !!h?.submitted_at,
      icon: 'camera',
      title: `${isClose ? 'Close-out' : 'Shift swap'} photos and notes`,
      sub: h?.submitted_at ? `Submitted by ${h.submitted_by_name} at ${formatTime(h.submitted_at)}` : photos ? `${photos} photo${photos === 1 ? '' : 's'} so far · not submitted` : 'Photos required before you leave',
      to: '/handoff',
    });
    const left = reqs.filter((r) => !r.done).length;
    const status = j === current ? 'now' : j < current ? (left ? 'missed' : 'done') : 'later';
    return { s, def, endsAt, lead, reqs, left, status, tone: shiftTone(shiftNames, s) };
  });

  const anyShift = progress.filter((p) => !shiftNames.includes(p.template.shift) && p.total > 0);
  const anyJobs = cleaning.filter((i) => !shiftNames.includes(i.task.shift) && i.status !== 'later');
  const anyJobsDone = anyJobs.filter((i) => i.status === 'done').length;

  // Celebrate when the current shift's whole list gets cleared while the app is open.
  const now = cards.find((c) => c.status === 'now');
  const prevLeft = useRef<number | null>(null);
  useEffect(() => {
    if (!ready || !now) return;
    if (prevLeft.current !== null && prevLeft.current > 0 && now.left === 0) {
      celebrate(`${now.s} shift: everything’s done`, 'Every requirement for this shift is checked off. Great work.');
    }
    prevLeft.current = now.left;
  }, [ready, now?.left, now?.s]);
  const myNext = !isKitchen && myLeadId
    ? entries.filter((e) => e.lead_id === myLeadId && (e.shift_date > today || (e.shift_date === today && shiftNames.indexOf(e.shift) >= current)))[0]
    : undefined;

  return (
    <>
      <section className={`shift-banner tone-${tone}`}>
        <div>
          <span className="shift-banner-date">{formatDay(today)} <DayDot date={today} /></span>
          <h1>{shift} shift <span className="pill">Now</span></h1>
        </div>
        <div className="shift-banner-who">
          <Icon name="user" size={18} />
          <span>
            {actorName ? <>{isKitchen ? 'Shift Lead' : 'Logging as'} <strong>{actorName}</strong></> : 'No Shift Lead selected'}
            {myNext && (
              <small>You lead next: {myNext.shift_date === today ? 'today' : myNext.shift_date === addDays(today, 1) ? 'tomorrow' : formatDay(myNext.shift_date)} {myNext.shift}</small>
            )}
          </span>
        </div>
      </section>

      <section className="req-board" aria-label="Today's shift requirements">
        {cards.map((c) => (
          <article key={c.s} className={`card req-card tone-${c.tone} status-${c.status}`}>
            <header className="req-head">
              <span className="req-shift"><i className="req-dot" aria-hidden="true" />{c.s} shift</span>
              <span className={`req-status ${c.status}`}>
                {c.status === 'now' ? 'Now' : c.status === 'later' ? 'Later today' : c.status === 'done' ? 'All done' : 'Not finished'}
              </span>
            </header>
            <p className="req-meta">
              {c.def ? `${formatClock(c.def.start)} – ${formatClock(c.endsAt)}` : ''} · Lead <strong>{c.lead ?? 'not set'}</strong>
            </p>
            <div className="todo-bar" aria-hidden="true"><span style={{ width: `${((c.reqs.length - c.left) / Math.max(1, c.reqs.length)) * 100}%` }} /></div>
            <span className="req-count">{c.left === 0 ? 'Everything done' : `${c.reqs.length - c.left} of ${c.reqs.length} done`}</span>
            <ul className="todo-list">
              {c.reqs.map((r) => (
                <li key={r.key}>
                  <Link to={r.to} className={`todo-row ${r.done ? 'done' : ''}`}>
                    <span className="todo-icon" aria-hidden="true"><Icon name={r.done ? 'done' : r.icon} size={18} /></span>
                    <span className="todo-text">
                      <strong>{r.title}</strong>
                      <small>{r.sub}</small>
                    </span>
                    <span className="sr-only">{r.done ? 'Done' : 'To do'}</span>
                    <Icon name="chevron" size={18} />
                  </Link>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      {(anyShift.length > 0 || anyJobs.length > 0) && (
        <div className="any-shift">
          <span className="eyebrow">Any shift</span>
          {anyJobs.length > 0 && (
            <Link to="/cleaning?shift=all" className={`any-chip ${anyJobsDone === anyJobs.length ? 'done' : ''}`}>
              <Icon name={anyJobsDone === anyJobs.length ? 'done' : 'broom'} size={14} /> Cleaning <b>{anyJobsDone}/{anyJobs.length}</b>
            </Link>
          )}
          {anyShift.map((p) => (
            <Link key={p.template.id} to={`/checklists/${p.template.id}`} className={`any-chip ${p.done === p.total ? 'done' : ''}`}>
              <Icon name={p.done === p.total ? 'done' : 'check'} size={14} /> {p.template.name} <b>{p.done}/{p.total}</b>
            </Link>
          ))}
        </div>
      )}

      <div className="dash-grid">
        <RequestsCard open={requests} />
        <div className="stack">
          <FocusCard />
          <ShoutoutCard />
        </div>
      </div>

      <LeadOfMonthBanner />

      {!isKitchen && myLeadId && (
        <div className="dash-grid">
          {canViewScores && <MyScoreCard leadId={myLeadId} />}
          <NotesForYou leadId={myLeadId} />
        </div>
      )}
    </>
  );
}

function RequestsCard({ open }: { open: KitchenRequest[] }) {
  const broken = open.filter((r) => r.kind === 'broken').length;
  const needed = open.length - broken;
  return (
    <section className="card sec-notes notes-panel">
      <div className="card-head">
        <h2><span className="dot dot-danger" />Equipment &amp; supplies</h2>
        <Link to="/notes" className="link-more">See all <Icon name="chevron" size={16} /></Link>
      </div>
      {open.length === 0 ? (
        <div className="all-clear"><Icon name="done" size={18} /> Nothing broken or needed right now</div>
      ) : (
        <>
          <p className="muted small">{broken ? `${broken} broken` : ''}{broken && needed ? ' · ' : ''}{needed ? `${needed} needed` : ''}</p>
          <div className="request-list">
            {open.slice(0, 3).map((r) => <RequestCard key={r.id} request={r} compact />)}
            {open.length > 3 && <Link to="/notes" className="link-more">+{open.length - 3} more</Link>}
          </div>
        </>
      )}
      <div className="row-gap wrap">
        <Link to="/notes?new=broken" className="btn btn-ghost grow"><Icon name="wrench" size={18} /> Something’s broken</Link>
        <Link to="/notes?new=need" className="btn btn-ghost grow"><Icon name="box" size={18} /> We need something</Link>
      </div>
    </section>
  );
}

/** Coaching notes a director chose to share with this lead. */
function NotesForYou({ leadId }: { leadId: string }) {
  const { notes } = useCoachingNotes(leadId);
  const recent = notes.filter((n) => n.shared_with_lead && Date.now() - new Date(n.created_at).getTime() < 30 * 864e5).slice(0, 3);
  if (recent.length === 0) return null;
  return (
    <section className="card sec-scores">
      <div className="card-head"><h2><span className="dot" />Notes for you</h2></div>
      <div className="coach-list">{recent.map((n) => <CoachNoteCard key={n.id} note={n} compact />)}</div>
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
  const { open: requests } = useKitchenRequests();
  const { notes: coaching } = useCoachingNotes();
  const { items: cleaning } = useCleaning(today);
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
  const broken = requests.filter((r) => r.kind === 'broken');
  const needed = requests.filter((r) => r.kind === 'need');
  if (broken.length) {
    const oldest = broken[broken.length - 1];
    items.push({ key: 'broken', level: 'danger', icon: 'wrench', title: `${broken.length} thing${broken.length === 1 ? '' : 's'} broken`, sub: broken.slice(0, 3).map((r) => r.title).join(' · ') + ` · oldest ${timeAgo(oldest.created_at)}`, to: '/notes' });
  }
  if (needed.length) {
    items.push({ key: 'needed', level: 'warn', icon: 'box', title: `${needed.length} supply request${needed.length === 1 ? '' : 's'}`, sub: needed.slice(0, 3).map((r) => r.title).join(' · '), to: '/notes' });
  }
  const overdueJobs = cleaning.filter((i) => i.status === 'overdue');
  if (overdueJobs.length) {
    items.push({ key: 'cleaning', level: 'warn', icon: 'broom', title: `${overdueJobs.length} cleaning job${overdueJobs.length === 1 ? '' : 's'} overdue`, sub: overdueJobs.slice(0, 3).map((i) => i.task.name).join(' · '), to: '/cleaning?shift=all' });
  }
  const followUps = coaching.filter((n) => followUpDue(n, today));
  if (followUps.length) {
    items.push({ key: 'follow', level: 'warn', icon: 'edit', title: `${followUps.length} coaching follow-up${followUps.length === 1 ? '' : 's'} due`, sub: [...new Set(followUps.map((n) => n.subject_name))].join(', '), to: '/coaching' });
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
          <button className="btn btn-ghost btn-block" onClick={onShiftView}><Icon name="clock" size={18} /> See today’s shift requirements</button>
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
