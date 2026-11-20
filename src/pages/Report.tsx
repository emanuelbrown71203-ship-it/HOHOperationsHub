import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { addDays } from '../lib/dates';
import { categoryAverages, fmtAvg, monthName, monthStart, pct, prevMonth } from '../lib/useScores';
import type { ChecklistCheck, ChecklistItem, ChecklistTemplate, CoachingNote, HohLead, KitchenRequest, LeadOfMonth, RatingRecord, WasteEntry } from '../lib/types';
import { Meter } from '../components/ScoreCharts';
import Icon from '../components/Icon';

function nextMonth(date: string) {
  const [y, m] = date.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

interface Data {
  records: RatingRecord[];
  shifts: { lead_id: string; submitted_at: string | null; shift_date: string; shift: string }[];
  leads: HohLead[];
  waste: WasteEntry[];
  requests: KitchenRequest[];
  openRequests: KitchenRequest[];
  checks: ChecklistCheck[];
  templates: ChecklistTemplate[];
  items: ChecklistItem[];
  coaching: CoachingNote[];
  winner: LeadOfMonth | null;
}

/** One printable page a director can take to a meeting: the month in numbers. */
export default function Report() {
  const { today, shift, settings } = useApp();
  const [month, setMonth] = useState(() => monthStart(today));
  const [d, setD] = useState<Data | null>(null);
  const end = addDays(nextMonth(month), -1);
  const through = end < today ? end : today;
  const current = month === monthStart(today);

  const load = useCallback(async () => {
    setD(null);
    const range = <T,>(q: T & { gte: (c: string, v: string) => T & { lte: (c: string, v: string) => PromiseLike<{ data: unknown }> } }, col: string) => q.gte(col, month).lte(col, end);
    const [records, shifts, leads, waste, requests, open, checks, templates, items, coaching, winner] = await Promise.all([
      range(supabase.from('lead_rating_history').select('*') as never, 'shift_date'),
      range(supabase.from('shift_handoffs').select('lead_id,submitted_at,shift_date,shift').not('lead_id', 'is', null) as never, 'shift_date'),
      supabase.from('hoh_leads').select('*').order('sort_order'),
      range(supabase.from('waste_entries').select('*') as never, 'log_date'),
      supabase.from('kitchen_requests').select('*').gte('created_at', `${month}T00:00:00`).lte('created_at', `${end}T23:59:59`),
      supabase.from('kitchen_requests').select('*').eq('status', 'open'),
      range(supabase.from('checklist_checks').select('*') as never, 'check_date'),
      supabase.from('checklist_templates').select('*').eq('active', true),
      supabase.from('checklist_items').select('*').eq('active', true),
      supabase.from('coaching_notes').select('*').gte('created_at', `${month}T00:00:00`).lte('created_at', `${end}T23:59:59`).order('created_at'),
      supabase.rpc('lead_of_month', { p_month: month }),
    ]);
    const rows = <T,>(r: { data: unknown }) => (r.data as T[]) ?? [];
    setD({
      records: rows<RatingRecord>(records).map((x) => ({ ...x, rating: Number(x.rating), score: Number(x.score ?? x.rating) })),
      shifts: rows(shifts),
      leads: rows(leads),
      waste: rows(waste),
      requests: rows(requests),
      openRequests: rows(open),
      checks: rows(checks),
      templates: rows(templates),
      items: rows(items),
      coaching: rows(coaching),
      winner: (winner.data as LeadOfMonth) ?? null,
    });
  }, [month, end]);
  useEffect(() => {
    load();
  }, [load]);

  const title = `${monthName(month)} ${month.slice(0, 4)}`;

  return (
    <div className="page sec-scores report">
      <Link to="/scores" className="back-link no-print"><Icon name="back" /> Lead Scores</Link>
      <div className="page-head">
        <div>
          <span className="shift-tag">{settings.store_name} · HOH monthly report</span>
          <h1>{title}</h1>
          {current && <span className="muted small">Month so far, through today</span>}
        </div>
        <div className="week-nav no-print">
          <button className="icon-btn" onClick={() => setMonth(prevMonth(month))} aria-label="Previous month"><Icon name="back" /></button>
          <button className="icon-btn" onClick={() => setMonth(nextMonth(month))} disabled={current} aria-label="Next month"><Icon name="chevron" /></button>
          <button className="btn btn-primary" onClick={() => window.print()}><Icon name="print" size={18} /> Print or save as PDF</button>
        </div>
      </div>

      {!d ? <div className="spinner" /> : <Body d={d} today={today} shift={shift} month={month} through={through} cats={settings.rating_categories} />}
    </div>
  );
}

function Body({ d, today, shift, month, through, cats }: { d: Data; today: string; shift: string; month: string; through: string; cats: string[] }) {
  const led = d.shifts.filter((s) => !(s.shift_date === today && s.shift === shift));
  const storeAvg = avg(d.records.map((r) => r.score));
  const leadRows = d.leads
    .map((l) => {
      const mine = d.records.filter((r) => r.lead_id === l.id);
      const shifts = led.filter((s) => s.lead_id === l.id);
      return { lead: l, avg: avg(mine.map((r) => r.score)), count: mine.length, shifts: shifts.length, submitted: shifts.filter((s) => s.submitted_at).length, cats: categoryAverages(mine, cats) };
    })
    .filter((r) => r.count > 0 || r.shifts > 0)
    .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || b.count - a.count);
  const storeCats = categoryAverages(d.records, cats);
  const catNames = storeCats.map((c) => c.name);

  const byReason = new Map<string, number>();
  const byItem = new Map<string, number>();
  for (const w of d.waste) {
    byReason.set(w.reason, (byReason.get(w.reason) ?? 0) + 1);
    byItem.set(w.item_name, (byItem.get(w.item_name) ?? 0) + 1);
  }
  const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

  const brokenReported = d.requests.filter((r) => r.kind === 'broken');
  const neededReported = d.requests.filter((r) => r.kind === 'need');
  const coachBy = new Map<string, { coaching: number; praise: number }>();
  for (const n of d.coaching) {
    const c = coachBy.get(n.subject_name) ?? { coaching: 0, praise: 0 };
    c[n.kind]++;
    coachBy.set(n.subject_name, c);
  }
  const days = Math.max(1, Math.round((new Date(through).getTime() - new Date(month).getTime()) / 86400000) + 1);
  const daily = d.templates.filter((t) => t.frequency === 'daily');
  const dailyItems = d.items.filter((i) => daily.some((t) => t.id === i.template_id));
  const dailyDone = d.checks.filter((c) => dailyItems.some((i) => i.id === c.item_id)).length;
  const checklistPct = pct(dailyDone, dailyItems.length * days);

  return (
    <>
      <div className="stat-row">
        <div className="stat-tile"><span className="stat-label">Store average</span><span className="stat-value">{fmtAvg(storeAvg)}<small>/ 5</small></span><span className="stat-foot muted">{d.records.length} rated shifts</span></div>
        <div className="stat-tile"><span className="stat-label">Handoffs submitted</span><span className="stat-value">{pct(led.filter((s) => s.submitted_at).length, led.length) ?? '–'}{led.length > 0 && <small>%</small>}</span><span className="stat-foot muted">{led.filter((s) => s.submitted_at).length} of {led.length} shifts</span></div>
        <div className="stat-tile"><span className="stat-label">Daily checklists done</span><span className="stat-value">{checklistPct === null ? '–' : Math.min(100, checklistPct)}{checklistPct !== null && <small>%</small>}</span><span className="stat-foot muted">{dailyDone} tasks checked off</span></div>
        <div className="stat-tile"><span className="stat-label">Lead of the Month</span><span className="stat-value stat-name">{d.winner?.name ?? '–'}</span><span className="stat-foot muted">{d.winner?.avg != null ? `${Number(d.winner.avg).toFixed(1)} from ${d.winner.ratings} shifts` : 'Needs 3 rated shifts'}</span></div>
      </div>

      <section className="card">
        <div className="card-head"><h2><span className="dot" />HOH Leads</h2></div>
        {leadRows.length === 0 ? (
          <p className="muted">No shifts were led or rated this month.</p>
        ) : (
          <div className="table-scroll">
            <table className="report-table">
              <thead>
                <tr>
                  <th scope="col">Lead</th><th scope="col" className="num">Average</th><th scope="col" className="num">Rated</th><th scope="col" className="num">Shifts led</th><th scope="col" className="num">Handoffs</th>
                  {catNames.map((c) => <th key={c} scope="col" className="num">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {leadRows.map((r) => (
                  <tr key={r.lead.id}>
                    <th scope="row">{r.lead.name}</th>
                    <td className="num"><strong>{fmtAvg(r.avg)}</strong></td>
                    <td className="num">{r.count}</td>
                    <td className="num">{r.shifts}</td>
                    <td className="num">{pct(r.submitted, r.shifts) === null ? '–' : `${pct(r.submitted, r.shifts)}%`}</td>
                    {catNames.map((c) => <td key={c} className="num">{r.cats.find((x) => x.name === c)?.avg.toFixed(1) ?? '–'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {storeCats.length > 0 && (
        <section className="card">
          <div className="card-head"><h2><span className="dot" />Setup quality by category</h2></div>
          <ul className="cat-meters">
            {storeCats.map((c) => (
              <li key={c.name}><span className="cat-name">{c.name}</span><Meter value={c.avg} label={`${c.name}: ${c.avg.toFixed(1)} out of 5`} /><span className="meter-value">{c.avg.toFixed(1)}</span></li>
            ))}
          </ul>
        </section>
      )}

      <div className="score-grid">
        <section className="card">
          <div className="card-head"><h2><span className="dot" />Waste</h2><span className="muted small">{d.waste.length} entries</span></div>
          {d.waste.length === 0 ? <p className="muted">No waste logged.</p> : (
            <div className="report-cols">
              <div><h3>Top reasons</h3><ol className="plain-list">{top(byReason, 5).map(([k, n]) => <li key={k}><span>{k}</span><b>{n}</b></li>)}</ol></div>
              <div><h3>Top items</h3><ol className="plain-list">{top(byItem, 5).map(([k, n]) => <li key={k}><span>{k}</span><b>{n}</b></li>)}</ol></div>
            </div>
          )}
        </section>
        <section className="card">
          <div className="card-head"><h2><span className="dot" />Equipment &amp; supplies</h2></div>
          <ol className="plain-list">
            <li><span>Broken equipment reported this month</span><b>{brokenReported.length}</b></li>
            <li><span>Of those, fixed</span><b>{brokenReported.filter((r) => r.status === 'done').length}</b></li>
            <li><span>Supply requests this month</span><b>{neededReported.length}</b></li>
            <li><span>Of those, taken care of</span><b>{neededReported.filter((r) => r.status === 'done').length}</b></li>
            <li><span>Still open right now</span><b>{d.openRequests.length}</b></li>
          </ol>
          {d.openRequests.length > 0 && <p className="muted small">Open: {d.openRequests.slice(0, 6).map((r) => r.title).join(', ')}{d.openRequests.length > 6 ? '…' : ''}</p>}
        </section>
      </div>

      <section className="card">
        <div className="card-head"><h2><span className="dot" />Coaching</h2><span className="muted small">{d.coaching.length} note{d.coaching.length === 1 ? '' : 's'} this month</span></div>
        {d.coaching.length === 0 ? <p className="muted">No coaching notes this month.</p> : (
          <ul className="plain-list">
            {[...coachBy.entries()].map(([name, c]) => (
              <li key={name}><span><strong>{name}</strong></span><span className="muted small">{c.coaching} coaching · {c.praise} praise</span></li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
