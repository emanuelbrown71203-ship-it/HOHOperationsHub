export type Role = 'pending' | 'team_member' | 'lead' | 'director' | 'kitchen';

export const ROLE_LABELS: Record<Role, string> = {
  pending: 'No access (pending)',
  team_member: 'Team Member',
  lead: 'HOH Lead',
  director: 'Director',
  kitchen: 'Shared Kitchen Device',
};

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  /** Admins configure the app (Setup, team accounts, who sees lead scores). */
  is_admin: boolean;
  created_at: string;
}

export interface HohLead {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
  /** The person's own account, if an admin linked one (their handoffs are then credited to them). */
  profile_id: string | null;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  shift: string;
  frequency: 'daily' | 'weekly';
  sort_order: number;
  active: boolean;
}

export interface ChecklistItem {
  id: string;
  template_id: string;
  label: string;
  sort_order: number;
  active: boolean;
  /** The task can only be checked off with a photo. */
  requires_photo: boolean;
}

export interface ChecklistCheck {
  id: string;
  template_id: string;
  item_id: string;
  check_date: string;
  checked_at: string;
  user_id: string | null;
  lead_id: string | null;
  performed_by_name: string;
  photo_path: string | null;
}

export interface WasteItem {
  id: string;
  name: string;
  default_unit: string;
  sort_order: number;
  active: boolean;
}

export interface WasteEntry {
  id: string;
  logged_at: string;
  log_date: string;
  shift: string;
  item_name: string;
  quantity: number;
  unit: string;
  reason: string;
  notes: string | null;
  user_id: string | null;
  performed_by_name: string;
}

export interface Equipment {
  id: string;
  name: string;
  category: string;
  sort_order: number;
  active: boolean;
}

/** 'issue' is special (open until resolved); every other value is an action name from Settings. */
export type EquipmentLogType = string;

export interface EquipmentLog {
  id: string;
  equipment_id: string;
  log_type: EquipmentLogType;
  notes: string | null;
  status: 'done' | 'open' | 'resolved';
  logged_at: string;
  log_date: string;
  shift: string;
  user_id: string | null;
  performed_by_name: string;
  resolved_at: string | null;
  resolved_by_name: string | null;
  resolution_notes: string | null;
  photo_path: string | null;
}

export interface WeeklyFocus {
  week_start: string;
  focus: string;
  created_by_name: string;
  updated_at: string;
}

export interface Shoutout {
  id: string;
  lead_id: string | null;
  lead_name: string;
  message: string;
  created_by_name: string;
  created_at: string;
}

export interface ShiftHandoff {
  id: string;
  shift_date: string;
  shift: string;
  notes: string | null;
  notes_by_name: string | null;
  notes_at: string | null;
  submitted_at: string | null;
  submitted_by_name: string | null;
  /** The HOH Lead who ran this shift (the one its rating counts for). */
  lead_id: string | null;
  lead_name: string | null;
  /** Everyone can see that a shift was rated and by whom; the score itself is in shift_ratings. */
  rated_by_name: string | null;
  rated_at: string | null;
}

/** A rating (readable only by people allowed to see lead scores). */
export interface ShiftRating {
  handoff_id: string;
  rating: number;
  comment: string | null;
  rated_by_name: string;
  rated_at: string;
  /** Exact average of the category stars (rating is this, rounded). */
  score: number | null;
  category_scores: Record<string, number> | null;
}

/** One row of the lead score record (the lead_rating_history view). */
export interface RatingRecord {
  handoff_id: string;
  shift_date: string;
  shift: string;
  lead_id: string | null;
  lead_name: string | null;
  rating: number;
  comment: string | null;
  rated_by_name: string;
  rated_at: string;
  handoff_submitted: boolean;
  photo_count: number;
  /** Exact average of the category stars; equals rating for single-star ratings. */
  score: number;
  category_scores: Record<string, number> | null;
}

/** Who is scheduled to lead a shift. */
export interface ScheduleEntry {
  id: string;
  shift_date: string;
  shift: string;
  lead_id: string;
  created_by_name: string;
  updated_at: string;
  notified_at: string | null;
  reminded_at: string | null;
}

export interface LeadOfMonth {
  lead_id: string;
  name: string;
  month: string;
  ratings: number | null;
  avg: number | null;
}

/** Someone on the team list for "Who's Trained" (no account needed). */
export interface TeamMember {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
}

export interface PositionSignoff {
  id: string;
  member_id: string;
  position_id: string;
  status: 'training' | 'trained';
  created_by_name: string;
  updated_at: string;
}

export type ScoresVisibility = 'directors' | 'managers' | 'everyone';

export const SCORES_VISIBILITY_LABELS: Record<ScoresVisibility, string> = {
  directors: 'Admins and directors',
  managers: 'Admins, directors and HOH Leads',
  everyone: 'Everyone on the team',
};

export interface HandoffPhoto {
  id: string;
  handoff_id: string;
  path: string;
  user_id: string | null;
  uploaded_by_name: string;
  created_at: string;
}

export interface Position {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  active: boolean;
}

export interface PositionFile {
  id: string;
  position_id: string;
  path: string;
  file_name: string;
  content_type: string | null;
  created_at: string;
}

export interface ShiftDef {
  name: string;
  /** Start time, 24-hour "HH:MM". */
  start: string;
}

export interface AppSettings {
  store_name: string;
  shifts: ShiftDef[];
  waste_reasons: string[];
  waste_units: string[];
  scores_visibility: ScoresVisibility;
  /** What the incoming shift rates, each 1 to 5 stars. Empty = one overall rating. */
  rating_categories: string[];
  fryer_filter_hours: number;
  fryer_oil_days: number;
  notifications_enabled: boolean;
  timezone: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  store_name: 'Our Store',
  shifts: [
    { name: 'AM', start: '05:00' },
    { name: 'PM', start: '14:00' },
  ],
  waste_reasons: ['Overcooked / burnt', 'Hold time expired', 'Dropped / contaminated', 'Overproduction', 'Quality issue', 'Customer return', 'Other'],
  waste_units: ['each', 'lbs', 'orders', 'pans', 'bags', 'trays', 'cases'],
  scores_visibility: 'directors',
  rating_categories: ['Stocked', 'Clean', 'Prepped', 'Organized'],
  fryer_filter_hours: 24,
  fryer_oil_days: 7,
  notifications_enabled: false,
  timezone: 'America/New_York',
};

const LEGACY_LOG_LABELS: Record<string, string> = {
  filter_change: 'Filter change',
  oil_change: 'Oil change',
  cleaning: 'Cleaning',
  maintenance: 'Maintenance',
};

export function logTypeLabel(type: string): string {
  if (type === 'issue') return 'Issue';
  return LEGACY_LOG_LABELS[type] ?? type;
}
