import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { useChecklists } from '../lib/useChecklists';
import Ring from '../components/Ring';
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
              <Link key={p.template.id} to={`/checklists/${p.template.id}?date=${date}`} className={`card card-link list-card ${current ? 'card-current' : ''}`}>
                <Ring done={p.done} total={p.total} size={64} stroke={7} />
                <div className="list-card-body">
                  <div className="list-card-top">
                    <span className="shift-tag">{p.template.shift === 'Any' ? 'Any shift' : `${p.template.shift} shift`}</span>
                    {current && date === today && <span className="pill pill-accent">Now</span>}
                  </div>
                  <h2>{p.template.name}</h2>
                  <span className="muted small">
                    {p.total === 0 ? 'No tasks yet' : p.done === p.total ? 'All tasks done' : `${p.total - p.done} of ${p.total} tasks left`}
                  </span>
                </div>
                <Icon name="chevron" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
