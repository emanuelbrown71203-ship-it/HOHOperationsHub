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
  kitchen: { to: '/kitchen', label: 'Kitchen', hint: 'Fryers, waste and broken equipment', icon: 'flame', section: 'fryers' },
  fryers: { to: '/fryers', label: 'Fryer Tracker', short: 'Fryers', hint: 'Log when each fryer is filtered or gets new oil, and see what is due', icon: 'flame', section: 'fryers' },
  waste: { to: '/waste', label: 'Waste Log', short: 'Waste', hint: 'Record food that was thrown away, and why', icon: 'trash', section: 'waste' },
  issues: { to: '/notes', label: 'Equipment Issues', short: 'Issues', hint: 'Report something broken and see what is still waiting to be fixed', icon: 'wrench', section: 'notes' },
  schedule: { to: '/schedule', label: 'Lead Schedule', short: 'Schedule', hint: 'Who leads each AM and PM shift', icon: 'calendar', section: 'schedule' },
  training: { to: '/training', label: 'Who’s Trained', hint: 'Which team members are trained on each position', icon: 'users', section: 'training' },
  scores: { to: '/scores', label: 'Lead Scores', short: 'Scores', hint: 'Star ratings and performance for each HOH Lead', icon: 'trophy', section: 'scores', show: (c) => c.canViewScores },
  report: { to: '/report', label: 'Monthly Report', hint: 'One printable page: scores, handoffs, waste, equipment and training', icon: 'file', section: 'scores', show: (c) => c.canSchedule },
  setup: { to: '/setup', label: 'Setup', hint: 'Team accounts, leads, checklists, positions, equipment, store settings', icon: 'gear', section: 'setup', show: (c) => c.isAdmin },
} satisfies Record<string, NavItem>;

const N = NAV_ITEMS;
const visible = (c: NavCtx) => (i: NavItem) => !i.show || i.show(c);

/** Menu groups, ordered for how this person uses the app. Home sits above them. */
export function navGroups(c: NavCtx): NavGroup[] {
  const shift: NavGroup = { key: 'shift', title: 'Run the shift', items: [N.checklists, N.handoff] };
  const kitchen: NavGroup = { key: 'kitchen', title: 'Kitchen', items: [N.fryers, N.waste, N.issues] };
  const team: NavGroup = { key: 'team', title: 'Team', items: [N.schedule, N.training] };
  const perf: NavGroup = { key: 'perf', title: 'Performance', items: [N.scores, N.report] };
  const admin: NavGroup = { key: 'admin', title: 'Admin', items: [N.setup] };
  const order = c.canSchedule ? [perf, team, shift, kitchen, admin] : [shift, kitchen, team, perf, admin];
  return order.map((g) => ({ ...g, items: g.items.filter(visible(c)) })).filter((g) => g.items.length > 0);
}

/** The phone tab bar (More is added after these). */
export function tabItems(c: NavCtx): NavItem[] {
  return c.canSchedule ? [N.home, N.scores, N.schedule, N.kitchen] : [N.home, N.checklists, N.handoff, N.kitchen];
}
