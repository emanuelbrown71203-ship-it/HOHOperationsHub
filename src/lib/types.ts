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
  created_at: string;
}

export interface HohLead {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
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
  track_action: string | null;
  track_hours: number | null;
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
  equipment_actions: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  store_name: 'Our Store',
  shifts: [
    { name: 'Opening', start: '05:00' },
    { name: 'Mid', start: '10:30' },
    { name: 'Closing', start: '16:00' },
  ],
  waste_reasons: ['Overcooked / burnt', 'Hold time expired', 'Dropped / contaminated', 'Overproduction', 'Quality issue', 'Customer return', 'Other'],
  waste_units: ['each', 'lbs', 'orders', 'pans', 'bags', 'trays', 'cases'],
  equipment_actions: ['Filter change', 'Oil change', 'Cleaning', 'Maintenance'],
};

const LEGACY_LOG_LABELS: Record<string, string> = {
  filter_change: 'Filter change',
  oil_change: 'Oil change',
  cleaning: 'Cleaning',
  maintenance: 'Maintenance',
};

export function logTypeLabel(type: string): string {
  if (type === 'issue') return 'Issue reported';
  return LEGACY_LOG_LABELS[type] ?? type;
}
