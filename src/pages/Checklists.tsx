import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { useChecklists } from '../lib/useChecklists';
import Progress from '../components/Progress';
import DateNav from '../components/DateNav';
import Icon from '../components/Icon';

export default function Checklists() {
  const { today, shift } = useApp();
  const [date, setDate] = useState(today);
  const { progress, loading } = useChecklists(date);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Shift Checklists</h1>
        <DateNav date={date} today={today} onChange={setDate} />
      </div>

      {loading ? (
        <div className="spinner" />
      ) : progress.length === 0 ? (
        <div className="empty">No checklists yet. A lead or director can add them in Setup.</div>
      ) : (
        <div className="card-list">
          {progress.map((p) => {
            const current = p.template.shift === shift;
            return (
              <Link key={p.template.id} to={`/checklists/${p.template.id}?date=${date}`} className={`card card-link ${current ? 'card-current' : ''}`}>
                <div className="row-between">
                  <div>
                    <h2>{p.template.name}</h2>
                    <div className="muted small">
                      {p.template.shift === 'Any' ? 'Any shift' : `${p.template.shift} shift`}
                      {current && date === today && <span className="pill pill-accent">Now</span>}
                    </div>
                  </div>
                  <div className="row-gap">
                    <span className={`count ${p.done === p.total && p.total > 0 ? 'count-done' : ''}`}>
                      {p.done}/{p.total}
                    </span>
                    <Icon name="chevron" />
                  </div>
                </div>
                <Progress done={p.done} total={p.total} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
