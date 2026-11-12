import { addDays, formatDay } from '../lib/dates';
import Icon from './Icon';

export default function DateNav({ date, today, onChange }: { date: string; today: string; onChange: (d: string) => void }) {
  return (
    <div className="datenav">
      <button className="icon-btn" onClick={() => onChange(addDays(date, -1))} aria-label="Previous day">
        <Icon name="back" />
      </button>
      <label className="datenav-label">
        <span>{date === today ? 'Today' : formatDay(date)}</span>
        <input type="date" value={date} max={today} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Pick a date" />
      </label>
      <button className="icon-btn" onClick={() => onChange(addDays(date, 1))} disabled={date >= today} aria-label="Next day">
        <Icon name="chevron" />
      </button>
    </div>
  );
}
