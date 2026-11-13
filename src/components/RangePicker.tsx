import { useState } from 'react';
import { addDays } from '../lib/dates';

export type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': '7 days',
  '30d': '30 days',
  custom: 'Custom',
};

export function rangeTitle(key: RangeKey) {
  return key === '7d' || key === '30d' ? `Last ${RANGE_LABELS[key]}` : key === 'custom' ? 'Custom range' : RANGE_LABELS[key];
}

/** Date range state for history lists: presets plus a custom from/to. */
export function useRange(today: string, initial: RangeKey = 'today') {
  const [key, setKey] = useState<RangeKey>(initial);
  const [customFrom, setCustomFrom] = useState(addDays(today, -6));
  const [customTo, setCustomTo] = useState(today);
  let from = today;
  let to = today;
  if (key === 'yesterday') from = to = addDays(today, -1);
  if (key === '7d') from = addDays(today, -6);
  if (key === '30d') from = addDays(today, -29);
  if (key === 'custom') {
    from = customFrom <= customTo ? customFrom : customTo;
    to = customFrom <= customTo ? customTo : customFrom;
  }
  return { key, setKey, from, to, customFrom, customTo, setCustomFrom, setCustomTo, today };
}

export type RangeState = ReturnType<typeof useRange>;

export default function RangePicker({ range }: { range: RangeState }) {
  return (
    <div className="range">
      <div className="segmented segmented-sm" role="tablist" aria-label="Date range">
        {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={range.key === k} className={range.key === k ? 'on' : ''} onClick={() => range.setKey(k)}>
            {RANGE_LABELS[k]}
          </button>
        ))}
      </div>
      {range.key === 'custom' && (
        <div className="range-custom">
          <label>
            <span>From</span>
            <input type="date" value={range.customFrom} max={range.today} onChange={(e) => e.target.value && range.setCustomFrom(e.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={range.customTo} max={range.today} onChange={(e) => e.target.value && range.setCustomTo(e.target.value)} />
          </label>
        </div>
      )}
    </div>
  );
}
