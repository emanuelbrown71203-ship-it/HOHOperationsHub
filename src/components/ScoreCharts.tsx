import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { WeekPoint } from '../lib/useScores';
import Icon from './Icon';

/* ------------------------------------------------------------------ */
/* Stat tile: label · value · optional delta and note                  */
/* ------------------------------------------------------------------ */
export function StatTile({ label, value, unit, delta, note, icon }: { label: string; value: string; unit?: string; delta?: ReactNode; note?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{icon}{label}</span>
      <span className="stat-value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {(delta || note) && (
        <span className="stat-foot">
          {delta}
          {note && <span className="muted">{note}</span>}
        </span>
      )}
    </div>
  );
}

/** Change in average stars vs the previous period: icon + signed value + words, never color alone. */
export function Delta({ value, period }: { value: number | null; period?: string }) {
  if (value === null) return <span className="delta delta-none">No earlier ratings to compare</span>;
  const r = Math.round(value * 10) / 10;
  if (r === 0) return <span className="delta delta-flat">No change{period ? ` vs ${period}` : ''}</span>;
  const up = r > 0;
  return (
    <span className={`delta ${up ? 'delta-up' : 'delta-down'}`}>
      <Icon name={up ? 'up' : 'down'} size={14} />
      {up ? '+' : '−'}
      {Math.abs(r).toFixed(1)} stars{period ? ` vs ${period}` : ''}
    </span>
  );
}

/** Average out of 5 as a meter: the track is a lighter step of the fill's own hue. */
export function Meter({ value, max = 5, label }: { value: number | null; max?: number; label: string }) {
  const pctWidth = value === null ? 0 : Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <span className="meter" role="img" aria-label={label} title={label}>
      <span className="meter-fill" style={{ width: `${pctWidth}%` }} />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Star breakdown: one bar per star level (5 → 1), one hue             */
/* ------------------------------------------------------------------ */
export function StarBreakdown({ dist }: { dist: [number, number, number, number, number] }) {
  const max = Math.max(1, ...dist);
  const total = dist.reduce((a, b) => a + b, 0);
  return (
    <div className="breakdown" role="table" aria-label="Ratings by number of stars">
      {[5, 4, 3, 2, 1].map((star) => {
        const n = dist[star - 1];
        const share = total ? Math.round((n / total) * 100) : 0;
        return (
          <div key={star} className="breakdown-row" role="row" title={`${star} star${star > 1 ? 's' : ''}: ${n} rating${n === 1 ? '' : 's'} (${share}%)`}>
            <span className="breakdown-label" role="rowheader">{star} <span className="star-glyph" aria-hidden="true">★</span></span>
            <span className="breakdown-track" role="cell">
              {n > 0 && <span className="breakdown-bar" style={{ width: `${(n / max) * 100}%` }} />}
            </span>
            <span className="breakdown-count" role="cell">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trend: a lead's weekly average (accent) vs the store's (gray)       */
/* ------------------------------------------------------------------ */
const H = 230; // plot + axis band
const PAD = { top: 14, right: 78, bottom: 30, left: 30 };

export function TrendChart({ weeks, leadName }: { weeks: WeekPoint[]; leadName: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = weeks.length;
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + ((5 - v) / 4) * plotH;

  const paths = useMemo(() => {
    const seg = (key: 'lead' | 'store') => {
      const parts: string[] = [];
      let d = '';
      weeks.forEach((w, i) => {
        const v = w[key];
        if (v === null) {
          if (d) parts.push(d);
          d = '';
        } else d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      });
      if (d) parts.push(d);
      return parts;
    };
    return { lead: seg('lead'), store: seg('store') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks, width]);

  if (n === 0) return <p className="muted">No ratings in this period yet.</p>;

  const lastIdx = (key: 'lead' | 'store') => {
    for (let i = n - 1; i >= 0; i--) if (weeks[i][key] !== null) return i;
    return -1;
  };
  const li = lastIdx('lead');
  const si = lastIdx('store');
  const leadEndY = li >= 0 ? y(weeks[li].lead!) : null;
  const storeEndY = si >= 0 ? y(weeks[si].store!) : null;
  // Direct end labels; drop the context label if the two would collide.
  const showStoreLabel = storeEndY !== null && (leadEndY === null || Math.abs(storeEndY - leadEndY) >= 16 || si !== li);

  const tickEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 70))));

  function pick(clientX: number) {
    const rect = wrap.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    let best = 0;
    let dist = Infinity;
    for (let i = 0; i < n; i++) {
      const dd = Math.abs(x(i) - px);
      if (dd < dist) {
        dist = dd;
        best = i;
      }
    }
    setActive(best);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? n) - 1));
    else if (e.key === 'ArrowRight') setActive((a) => Math.min(n - 1, (a ?? -1) + 1));
    else if (e.key === 'Escape') setActive(null);
    else return;
    e.preventDefault();
  }

  const w = active !== null ? weeks[active] : null;
  const tipLeft = active !== null ? Math.min(Math.max(x(active) + 12, 8), width - 196) : 0;

  return (
    <div className="trend">
      <div className="chart-legend" aria-hidden="true">
        <span><i className="key key-accent" />{leadName}</span>
        <span><i className="key key-context" />Store average</span>
      </div>
      <div
        ref={wrap}
        className="trend-plot"
        tabIndex={0}
        role="img"
        aria-label={`Weekly average stars for ${leadName} compared with the store. Use the arrow keys to read each week.`}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((a) => a ?? n - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
      >
        <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden="true">
          {[1, 2, 3, 4, 5].map((v) => (
            <g key={v}>
              <line className="grid" x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} />
              <text className="axis-text" x={PAD.left - 10} y={y(v) + 4} textAnchor="end">{v}</text>
            </g>
          ))}
          {weeks.map((wk, i) =>
            i % tickEvery === 0 || i === n - 1 ? (
              <text key={wk.key} className="axis-text" x={x(i)} y={H - 8} textAnchor="middle">{wk.label}</text>
            ) : null,
          )}
          {active !== null && <line className="crosshair" x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} />}
          {paths.store.map((d, i) => <path key={`s${i}`} d={d} className="line line-context" />)}
          {paths.lead.map((d, i) => <path key={`l${i}`} d={d} className="line line-accent" />)}
          {weeks.map((wk, i) =>
            wk.lead !== null ? <circle key={wk.key} className={`dot-accent ${active === i ? 'is-active' : ''}`} cx={x(i)} cy={y(wk.lead)} r={active === i ? 6 : 4.5} /> : null,
          )}
          {leadEndY !== null && (
            <text className="end-label" x={x(li) + 10} y={leadEndY + 4}>
              {leadName} {weeks[li].lead!.toFixed(1)}
            </text>
          )}
          {showStoreLabel && storeEndY !== null && (
            <text className="end-label end-label-muted" x={x(si) + 10} y={storeEndY + 4}>
              Store {weeks[si].store!.toFixed(1)}
            </text>
          )}
        </svg>
        {w && (
          <div className="chart-tip" style={{ left: tipLeft }}>
            <span className="tip-head">Week of {w.label}</span>
            <span className="tip-row"><i className="key key-accent" /><b>{w.lead === null ? '–' : w.lead.toFixed(1)}</b> {leadName} <small>({w.leadCount} rating{w.leadCount === 1 ? '' : 's'})</small></span>
            <span className="tip-row"><i className="key key-context" /><b>{w.store === null ? '–' : w.store.toFixed(1)}</b> Store average <small>({w.storeCount})</small></span>
          </div>
        )}
      </div>
      <details className="table-view">
        <summary>Show as table</summary>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr><th>Week of</th><th className="num">{leadName}</th><th className="num">Ratings</th><th className="num">Store average</th></tr>
            </thead>
            <tbody>
              {weeks.map((wk) => (
                <tr key={wk.key}>
                  <td>{wk.label}</td>
                  <td className="num">{wk.lead === null ? '–' : wk.lead.toFixed(2)}</td>
                  <td className="num">{wk.leadCount}</td>
                  <td className="num">{wk.store === null ? '–' : wk.store.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
