import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { useChecklists } from '../lib/useChecklists';
import { usePositions } from '../lib/usePositions';
import Ring from '../components/Ring';
import DateNav from '../components/DateNav';
import Icon from '../components/Icon';

export default function Checklists() {
  const { today, shift } = useApp();
  const [date, setDate] = useState(today);
  const { progress, loading } = useChecklists(date);
  const { positions, filesFor, loading: loadingPositions } = usePositions();

  return (
    <div className="page sec-checklists">
      <div className="page-title">
        <span className="page-icon"><Icon name="check" size={22} /></span>
        <h1>Checklists</h1>
      </div>

      <section className="stack">
        <div className="row-between wrap">
          <div>
            <h2 className="section-title"><Icon name="star" size={16} /> HOH Lead checklists</h2>
            <p className="muted small">Required. The HOH Lead checks these off in the app.</p>
          </div>
          <DateNav date={date} today={today} onChange={setDate} />
        </div>
        {loading ? (
          <div className="spinner" />
        ) : progress.length === 0 ? (
          <div className="empty">No HOH Lead checklists yet. An admin can add them in Setup → Lead checklists.</div>
        ) : (
          <div className="card-list">
            {progress.map((p) => {
              const current = p.template.shift === shift;
              return (
                <Link key={p.template.id} to={`/checklists/${p.template.id}?date=${date}`} className={`card card-link list-card ${current ? 'card-current' : ''}`}>
                  <Ring done={p.done} total={p.total} size={64} stroke={7} />
                  <div className="list-card-body">
                    <div className="list-card-top">
                      <span className="shift-tag">
                        {p.template.shift === 'Any' ? 'Any shift' : `${p.template.shift} shift`}
                        {p.template.frequency === 'weekly' && ' · Weekly'}
                      </span>
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
      </section>

      <section className="stack sec-positions">
        <div>
          <h2 className="section-title"><Icon name="file" size={16} /> Position checklists</h2>
          <p className="muted small">The printed checklist for each position, attached here so anyone can pull it up.</p>
        </div>
        {loadingPositions ? (
          <div className="spinner" />
        ) : positions.length === 0 ? (
          <div className="empty">No positions yet. An admin can add them in Setup → Positions.</div>
        ) : (
          <div className="position-grid">
            {positions.map((p) => {
              const n = filesFor(p.id).length;
              return (
                <Link key={p.id} to={`/positions/${p.id}`} className="position-card">
                  <span className="position-initial" aria-hidden="true">{p.name.slice(0, 1)}</span>
                  <strong>{p.name}</strong>
                  <span className={`small ${n ? 'muted' : 'text-warn'}`}>{n ? `${n} file${n > 1 ? 's' : ''} attached` : 'No checklist attached'}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
