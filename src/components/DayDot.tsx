// Day-dot rotation labels used for FIFO product dating (Mon blue … Sun black).
const DOTS = [
  { day: 'Sun', name: 'Black', color: '#1f2328' },
  { day: 'Mon', name: 'Blue', color: '#1c7ed6' },
  { day: 'Tue', name: 'Yellow', color: '#fab005' },
  { day: 'Wed', name: 'Red', color: '#e03131' },
  { day: 'Thu', name: 'Brown', color: '#8d5524' },
  { day: 'Fri', name: 'Green', color: '#2f9e44' },
  { day: 'Sat', name: 'Orange', color: '#f76707' },
];

export default function DayDot({ date }: { date: string }) {
  const [y, m, d] = date.split('-').map(Number);
  const dot = DOTS[new Date(y, m - 1, d).getDay()];
  return (
    <span className="daydot" title={`Today's day-dot label is ${dot.name}`}>
      <span className="daydot-swatch" style={{ background: dot.color }} />
      {dot.name} day dot
    </span>
  );
}
