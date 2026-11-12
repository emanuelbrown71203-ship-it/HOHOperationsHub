export type Role = 'pending' | 'team_member' | 'lead' | 'director' | 'kitchen';

export const ROLE_LABELS: Record<Role, string> = {
  pending: 'Pending approval',
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

export type EquipmentLogType = 'filter_change' | 'oil_change' | 'cleaning' | 'maintenance' | 'issue';

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

export const SHIFTS = ['Opening', 'Mid', 'Closing'] as const;
export type Shift = (typeof SHIFTS)[number];

export const WASTE_UNITS = ['each', 'lbs', 'orders', 'pans', 'bags', 'trays', 'cases'];

export const WASTE_REASONS = [
  'Overcooked / burnt',
  'Hold time expired',
  'Dropped / contaminated',
  'Overproduction',
  'Quality issue',
  'Customer return',
  'Other',
];

export const EQUIPMENT_LOG_LABELS: Record<EquipmentLogType, string> = {
  filter_change: 'Filter change',
  oil_change: 'Oil change',
  cleaning: 'Cleaning',
  maintenance: 'Maintenance',
  issue: 'Issue reported',
};
