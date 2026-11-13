/** Circular progress ring with the count in the middle. */
export default function Ring({ done, total, size = 64, stroke = 7, label }: { done: number; total: number; size?: number; stroke?: number; label?: string }) {
  const pct = total === 0 ? 0 : done / total;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const complete = total > 0 && done === total;
  return (
    <div
      className={`ring ${complete ? 'ring-done' : ''}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${done} of ${total} complete`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="ring-label">
        {complete ? '✓' : `${Math.round(pct * 100)}%`}
      </span>
    </div>
  );
}
