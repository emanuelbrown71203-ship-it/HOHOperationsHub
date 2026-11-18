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
};

const LEGACY_LOG_LABELS: Record<string, string> = {
  filter_change: 'Filter change',
  oil_change: 'Oil change',
  cleaning: 'Cleaning',
  maintenance: 'Maintenance',
};

export function logTypeLabel(type: string): string {
  if (type === 'issue') return 'Note';
  return LEGACY_LOG_LABELS[type] ?? type;
}
