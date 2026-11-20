import type { IconName } from '../components/Icon';

/**
 * One place that decides what's in the menu, the phone tab bar and the More page.
 * Two ways of using the app:
 *  - running the shift (HOH Leads, team members, the store tablet): shift tools first
 *  - managing (directors and admins): performance and the schedule first
 */
export interface NavCtx {
  isAdmin: boolean;
  canSchedule: boolean;
  canViewScores: boolean;
}

export interface NavItem {
  to: string;
  label: string;
  /** Shorter label for the phone tab bar. */
  short?: string;
  /** One line saying what the screen is for (More page). */
  hint: string;
  icon: IconName;
  section: string;
  show?: (c: NavCtx) => boolean;
}

export interface NavGroup {
  key: string;
  title: string;
  items: NavItem[];
}

export const NAV_ITEMS = {
  home: { to: '/', label: 'Home', hint: 'Today at a glance', icon: 'home', section: 'home' },
  checklists: { to: '/checklists', label: 'Checklists', hint: 'HOH Lead checklists and each position’s printed checklist', icon: 'check', section: 'checklists' },
  handoff: { to: '/handoff', label: 'Shift Handoff', short: 'Handoff', hint: 'Rate the last shift’s setup, then leave photos and notes for the next one', icon: 'swap', section: 'handoff' },
  cleaning: { to: '/cleaning', label: 'Cleaning Hub', short: 'Cleaning', hint: 'Cleaning jobs for the whole HOH: what’s due today, overdue and coming up', icon: 'broom', section: 'cleaning' },
  kitchen: { to: '/kitchen', label: 'Kitchen', hint: 'Broken equipment, supplies you need, and waste', icon: 'wrench', section: 'notes' },
  issues: { to: '/notes', label: 'Equipment & Supplies', short: 'Supplies', hint: 'Pass along something broken or something the kitchen needs', icon: 'wrench', section: 'notes' },
  waste: { to: '/waste', label: 'Waste Log', short: 'Waste', hint: 'Record food that was thrown away, and why', icon: 'trash', section: 'waste' },
  schedule: { to: '/schedule', label: 'Lead Schedule', short: 'Schedule', hint: 'Who leads each AM and PM shift', icon: 'calendar', section: 'schedule' },
  leaderboard: { to: '/leaderboard', label: 'Leaderboard', short: 'Leaders', hint: 'The top 5 HOH Leads by points, this week and this month', icon: 'trophy', section: 'scores' },
  scores: { to: '/scores', label: 'Lead Scores', short: 'Scores', hint: 'Star ratings and performance for each HOH Lead', icon: 'trophy', section: 'scores', show: (c) => c.canViewScores },
  coaching: { to: '/coaching', label: 'Coaching Notes', short: 'Coaching', hint: 'What you talked about with each lead, praise, and follow-ups', icon: 'edit', section: 'scores', show: (c) => c.canSchedule },
  report: { to: '/report', label: 'Monthly Report', hint: 'One printable page: scores, coaching, handoffs, waste, equipment and supplies', icon: 'file', section: 'scores', show: (c) => c.canSchedule },
  setup: { to: '/setup', label: 'Setup', hint: 'Team accounts, leads, checklists, positions, notifications, store settings', icon: 'gear', section: 'setup', show: (c) => c.isAdmin },
} satisfies Record<string, NavItem>;

const N = NAV_ITEMS;
const visible = (c: NavCtx) => (i: NavItem) => !i.show || i.show(c);

/** Menu groups, ordered for how this person uses the app. Home sits above them. */
export function navGroups(c: NavCtx): NavGroup[] {
  const shift: NavGroup = { key: 'shift', title: 'Run the shift', items: [N.checklists, N.cleaning, N.handoff] };
  const kitchen: NavGroup = { key: 'kitchen', title: 'Kitchen', items: [N.issues, N.waste] };
  const team: NavGroup = { key: 'team', title: 'Team', items: [N.schedule] };
  const perf: NavGroup = { key: 'perf', title: 'Performance', items: [N.leaderboard, N.scores, N.coaching, N.report] };
  const admin: NavGroup = { key: 'admin', title: 'Admin', items: [N.setup] };
  const order = c.canSchedule ? [perf, team, shift, kitchen, admin] : [shift, kitchen, team, perf, admin];
  return order.map((g) => ({ ...g, items: g.items.filter(visible(c)) })).filter((g) => g.items.length > 0);
}

/** The phone tab bar (More is added after these). */
export function tabItems(c: NavCtx): NavItem[] {
  return c.canSchedule ? [N.home, N.scores, N.schedule, N.kitchen] : [N.home, N.checklists, N.cleaning, N.handoff];
}
