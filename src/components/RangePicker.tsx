import { addDays } from '../lib/dates';

export type RangeKey = 'today' | 'yesterday' | '7d' | '30d';

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': '7 days',
  '30d': '30 days',
};

export function rangeDates(range: RangeKey, today: string): { from: string; to: string } {
  switch (range) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case '7d':
      return { from: addDays(today, -6), to: today };
    case '30d':
      return { from: addDays(today, -29), to: today };
  }
}

export default function RangePicker({ value, onChange }: { value: RangeKey; onChange: (r: RangeKey) => void }) {
  return (
    <div className="segmented segmented-sm" role="tablist" aria-label="Date range">
      {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {RANGE_LABELS[k]}
        </button>
      ))}
    </div>
  );
}
