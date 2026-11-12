export default function Progress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      <div className={`progress-fill ${pct === 100 ? 'complete' : ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
