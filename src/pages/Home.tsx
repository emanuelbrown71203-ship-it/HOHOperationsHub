import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { useChecklists } from '../lib/useChecklists';
import { formatClock, formatDay, formatTime } from '../lib/dates';
import { shiftTone } from '../lib/tone';
import { previousShift } from '../lib/handoff';
import Progress from '../components/Progress';
import Ring from '../components/Ring';
import DayDot from '../components/DayDot';
import Icon from '../components/Icon';
import Stars, { RATING_WORDS } from '../components/Stars';
import { FocusCard, ShoutoutCard } from '../components/HomeCards';
import ScoreboardCard from '../components/ScoreboardCard';
import { NoteCard, useKitchenNotes } from './Notes';
import { RateCard, useHandoffs } from './Handoff';

export default function Home() {
  const { today, shift, shiftNames, settings, actorName, isKitchen, canViewScores } = useApp();
  const { progress } = useChecklists(today);
  const { open: openNotes, nameOf } = useKitchenNotes(today);
  const { byKey, photosFor, ratingFor, reload: reloadHandoffs } = useHandoffs(today);

  const tone = shiftTone(shiftNames, shift);
  const shiftDef = settings.shifts.find((s) => s.name === shift);
  const isClose = shiftNames.indexOf(shift) === shiftNames.length - 1;

  const mine = progress.filter((p) => p.template.shift === shift || p.template.shift === 'Any');
  const done = mine.reduce((n, p) => n + p.done, 0);
  const total = mine.reduce((n, p) => n + p.total, 0);

  const prev = previousShift(today, shift, shiftNames);
  const prevHandoff = byKey.get(`${prev.date}|${prev.shift}`);
  const myHandoff = byKey.get(`${today}|${shift}`);
  const myPhotos = photosFor(myHandoff).length;

  return (
    <div className="page sec-home">
      {canViewScores && <ScoreboardCard />}

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

      <div className="home-top">
        <FocusCard />
        <ShoutoutCard />
      </div>

      <div className="quick">
        <Link to="/checklists" className="quick-btn sec-checklists"><span className="quick-icon"><Icon name="check" size={22} /></span>Checklists</Link>
        <Link to="/handoff" className="quick-btn sec-handoff"><span className="quick-icon"><Icon name="camera" size={22} /></span>{isClose ? 'Close-out photos' : 'Shift swap photos'}</Link>
        <Link to="/notes?new=1" className="quick-btn sec-notes"><span className="quick-icon"><Icon name="note" size={22} /></span>Kitchen note</Link>
      </div>

      <div className="dash-grid">
        <div className="stack">
          {prevHandoff?.rated_at && !canViewScores ? (
            <section className="card sec-handoff">
              <div className="card-head">
                <h2><span className="dot" />{prev.shift} shift setup</h2>
                <Link to="/handoff" className="link-more">Handoff <Icon name="chevron" size={16} /></Link>
              </div>
              <div className="rated">
                <div>
                  <strong className="rated-check"><Icon name="done" size={16} /> Rated by {prevHandoff.rated_by_name}</strong>
                  {prevHandoff.lead_name && <span className="muted small">Shift Lead: {prevHandoff.lead_name}</span>}
                </div>
              </div>
            </section>
          ) : prevHandoff?.rated_at && canViewScores && ratingFor(prevHandoff) ? (
            <section className="card sec-handoff">
              <div className="card-head">
                <h2><span className="dot" />{prev.shift} shift setup{prevHandoff.lead_name ? ` · ${prevHandoff.lead_name}` : ''}</h2>
                <Link to="/scores" className="link-more">Lead scores <Icon name="chevron" size={16} /></Link>
              </div>
              <div className="rated">
                <Stars value={ratingFor(prevHandoff)!.rating} />
                <div>
                  <strong>{RATING_WORDS[ratingFor(prevHandoff)!.rating]}</strong>
                  {ratingFor(prevHandoff)!.comment && <p className="rated-comment">“{ratingFor(prevHandoff)!.comment}”</p>}
                  <span className="muted small">Rated by {ratingFor(prevHandoff)!.rated_by_name}</span>
                </div>
              </div>
            </section>
          ) : (
            <div className="sec-handoff">
              <RateCard date={prev.date} shift={prev.shift} handoff={prevHandoff} rating={ratingFor(prevHandoff)} photos={photosFor(prevHandoff)} onSaved={reloadHandoffs} compact />
            </div>
          )}

          <section className={`card sec-handoff handoff-status ${myHandoff?.submitted_at ? 'is-done' : ''}`}>
            <div className="card-head">
              <h2><span className="dot" />Your {shift} handoff</h2>
              <Link to="/handoff" className="link-more">Open <Icon name="chevron" size={16} /></Link>
            </div>
            {myHandoff?.submitted_at ? (
              <div className="done-banner"><Icon name="done" size={18} /> Submitted by {myHandoff.submitted_by_name} at {formatTime(myHandoff.submitted_at)} · {myPhotos} photo{myPhotos === 1 ? '' : 's'}</div>
            ) : (
              <>
                <p className="muted small">Before you leave, upload {isClose ? 'close-out' : 'shift swap'} photos and any notes for the next shift.</p>
                <div className="status-steps">
                  <span className={myPhotos ? 'ok' : ''}><Icon name={myPhotos ? 'done' : 'camera'} size={16} /> {myPhotos ? `${myPhotos} photo${myPhotos > 1 ? 's' : ''}` : 'Photos needed'}</span>
                  <span className={myHandoff?.notes ? 'ok' : ''}><Icon name={myHandoff?.notes ? 'done' : 'note'} size={16} /> {myHandoff?.notes ? 'Notes added' : 'Notes (optional)'}</span>
                </div>
                <Link to="/handoff" className="btn btn-primary btn-block">Start handoff</Link>
              </>
            )}
          </section>

          <section className="card sec-checklists">
            <div className="card-head">
              <h2><span className="dot" />HOH Lead checklists</h2>
              <Link to="/checklists" className="link-more">All <Icon name="chevron" size={16} /></Link>
            </div>
            {progress.length === 0 ? (
              <p className="muted">No lead checklists yet. An admin can add them in Setup.</p>
            ) : (
              <ul className="mini-list">
                {[...progress].sort((a, b) => Number(b.template.shift === shift) - Number(a.template.shift === shift)).map((p) => (
                  <li key={p.template.id}>
                    <Link to={`/checklists/${p.template.id}`} className="mini-row">
                      <span className="mini-name">
                        {p.template.name}
                        {p.template.shift === shift && <span className="pill pill-accent">Now</span>}
                        {p.template.frequency === 'weekly' && <span className="pill">Weekly</span>}
                      </span>
                      <span className={`count ${p.total > 0 && p.done === p.total ? 'count-done' : ''}`}>{p.done}/{p.total}</span>
                    </Link>
                    <Progress done={p.done} total={p.total} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="card sec-notes notes-panel">
          <div className="card-head">
            <h2><span className="dot dot-danger" />Kitchen notes</h2>
            <Link to="/notes" className="link-more">All notes <Icon name="chevron" size={16} /></Link>
          </div>
          {openNotes.length === 0 ? (
            <div className="all-clear"><Icon name="done" size={18} /> Nothing broken right now</div>
          ) : (
            <div className="note-board compact">
              {openNotes.slice(0, 6).map((n) => <NoteCard key={n.id} note={n} equipmentName={nameOf(n.equipment_id)} compact />)}
              {openNotes.length > 6 && <Link to="/notes" className="link-more">+{openNotes.length - 6} more</Link>}
            </div>
          )}
          <Link to="/notes?new=1" className="btn btn-ghost btn-block"><Icon name="plus" size={18} /> Add a note</Link>
        </section>
      </div>
    </div>
  );
}
