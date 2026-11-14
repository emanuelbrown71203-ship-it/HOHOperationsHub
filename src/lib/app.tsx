import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { localDate, shiftForTime } from './dates';
import { DEFAULT_SETTINGS, type AppSettings, type HohLead, type Profile } from './types';
import { useRealtime } from './useRealtime';

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */
type ToastKind = 'ok' | 'error';
interface Toast { id: number; text: string; kind: ToastKind }

/* ------------------------------------------------------------------ */
/* Per-device state (kept in localStorage)                             */
/* ------------------------------------------------------------------ */
// The Shift Lead choice is tied to a specific day + shift, so the shared
// device asks again when the shift changes or the next day starts.
interface StoredLead { date: string; shift: string; leadId: string }
// A manual shift override lasts until the time-based shift changes.
interface StoredShift { date: string; autoShift: string; shift: string }
export type ThemeChoice = 'light' | 'dark' | 'auto';

const LEAD_KEY = 'hoh.shiftLead';
const SHIFT_KEY = 'hoh.shiftOverride';
const THEME_KEY = 'hoh.theme';

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */
interface AppState {
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  isManager: boolean;
  isDirector: boolean;
  isKitchen: boolean;
  /** True after someone opens a password-reset link; the app asks for a new password. */
  recovering: boolean;
  finishRecovery: () => void;

  settings: AppSettings;
  shiftNames: string[];

  today: string;
  shift: string;
  setShift: (s: string) => void;

  leads: HohLead[];
  leadId: string | null;
  setLeadId: (id: string | null) => void;
  /** The name that new entries will be attributed to, or null if a Shift Lead must be chosen first. */
  actorName: string | null;
  /** lead_id to send with inserts (only meaningful on the shared kitchen device). */
  actorLeadId: string | null;

  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;

  /** Whether this person may see lead scores (set by directors in Setup → Store). */
  canViewScores: boolean;
  /** The HOH Lead this device or account acts as: the chosen Shift Lead, or the lead linked to this account. */
  myLeadId: string | null;

  toast: (text: string, kind?: ToastKind) => void;
  /** Returns false (and shows a message) if nobody can be credited for a new entry yet. */
  ensureActor: () => boolean;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [leads, setLeads] = useState<HohLead[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tick, setTick] = useState(0); // re-evaluate time-based shift every minute
  const [recovering, setRecovering] = useState(false);

  /* ---- theme (per device) ---- */
  const [theme, setThemeState] = useState<ThemeChoice>(() => readJson<ThemeChoice>(THEME_KEY) ?? 'light');
  useEffect(() => {
    document.documentElement.setAttribute('data-app-theme', theme);
  }, [theme]);
  const setTheme = useCallback((t: ThemeChoice) => {
    setThemeState(t);
    writeJson(THEME_KEY, t);
  }, []);

  /* ---- auth ---- */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(s);
      if (!s) {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile((data as Profile) ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (userId) {
      setLoading(true);
      refreshProfile();
    }
  }, [userId, refreshProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const active = !!profile && profile.role !== 'pending';

  /* ---- HOH leads list + store settings ---- */
  const loadLeads = useCallback(async () => {
    if (!active) return;
    const { data } = await supabase.from('hoh_leads').select('*').eq('active', true).order('sort_order').order('name');
    setLeads((data as HohLead[]) ?? []);
  }, [active]);

  const loadSettings = useCallback(async () => {
    if (!active) return;
    const { data } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
    if (data) setSettings({ ...DEFAULT_SETTINGS, ...(data as Partial<AppSettings>) });
  }, [active]);

  useEffect(() => {
    loadLeads();
    loadSettings();
  }, [loadLeads, loadSettings]);
  useRealtime(active ? ['hoh_leads'] : [], loadLeads);
  useRealtime(active ? ['app_settings'] : [], loadSettings);

  /* ---- clock ---- */
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  /* ---- shift ---- */
  const [shiftOverride, setShiftOverride] = useState<StoredShift | null>(() => readJson<StoredShift>(SHIFT_KEY));
  const [storedLead, setStoredLead] = useState<StoredLead | null>(() => readJson<StoredLead>(LEAD_KEY));
  const shiftNames = useMemo(() => settings.shifts.map((s) => s.name), [settings.shifts]);

  const { today, shift } = useMemo(() => {
    void tick;
    const now = new Date();
    const date = localDate(now);
    const auto = shiftForTime(settings.shifts, now);
    const o = shiftOverride;
    const s = o && o.date === date && o.autoShift === auto && shiftNames.includes(o.shift) ? o.shift : auto;
    return { today: date, shift: s };
  }, [tick, shiftOverride, settings.shifts, shiftNames]);

  const setShift = useCallback(
    (s: string) => {
      const now = new Date();
      const next: StoredShift = { date: localDate(now), autoShift: shiftForTime(settings.shifts, now), shift: s };
      setShiftOverride(next);
      writeJson(SHIFT_KEY, next);
      // Keep the same Shift Lead when someone corrects the shift by hand.
      if (storedLead && storedLead.date === next.date) {
        const lead: StoredLead = { ...storedLead, shift: s };
        setStoredLead(lead);
        writeJson(LEAD_KEY, lead);
      }
    },
    [storedLead, settings.shifts],
  );

  const leadId =
    storedLead && storedLead.date === today && storedLead.shift === shift && leads.some((l) => l.id === storedLead.leadId)
      ? storedLead.leadId
      : null;

  const setLeadId = useCallback(
    (id: string | null) => {
      if (!id) {
        setStoredLead(null);
        writeJson(LEAD_KEY, null);
        return;
      }
      const next: StoredLead = { date: today, shift, leadId: id };
      setStoredLead(next);
      writeJson(LEAD_KEY, next);
    },
    [today, shift],
  );

  const isKitchen = profile?.role === 'kitchen';
  const actorName = isKitchen ? leads.find((l) => l.id === leadId)?.name ?? null : profile?.full_name || null;
  const myLeadId = isKitchen ? leadId : leads.find((l) => l.profile_id && l.profile_id === profile?.id)?.id ?? null;
  const isDirectorRole = profile?.role === 'director';
  const isManagerRole = profile?.role === 'lead' || isDirectorRole;
  const canViewScores =
    isDirectorRole || (settings.scores_visibility === 'managers' && isManagerRole) || (settings.scores_visibility === 'everyone' && active);

  /* ---- record the Shift Lead for this shift (shared device) ---- */
  // Ratings of this shift are credited to the lead recorded here.
  const recorded = useRef<string | null>(null);
  useEffect(() => {
    if (!isKitchen || !leadId) return;
    const key = `${today}|${shift}|${leadId}`;
    if (recorded.current === key) return;
    recorded.current = key;
    supabase.rpc('set_shift_lead', { p_date: today, p_shift: shift, p_lead_id: leadId }).then(({ error }) => {
      if (error) toastRef.current(error.message, 'error');
    });
  }, [isKitchen, leadId, today, shift]);

  /* ---- toasts ---- */
  const toastId = useRef(0);
  const toastRef = useRef<(text: string, kind?: ToastKind) => void>(() => {});
  const toast = useCallback((text: string, kind: ToastKind = 'ok') => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 2500);
  }, []);
  toastRef.current = toast;

  const ensureActor = useCallback(() => {
    if (actorName) return true;
    toast(isKitchen ? 'Choose the Shift Lead first (top of the screen).' : 'Add your name in Account first.', 'error');
    return false;
  }, [actorName, isKitchen, toast]);

  const value: AppState = {
    session,
    loading,
    profile,
    refreshProfile,
    signOut,
    isManager: profile?.role === 'lead' || profile?.role === 'director',
    isDirector: profile?.role === 'director',
    isKitchen,
    recovering,
    finishRecovery: () => setRecovering(false),
    settings,
    shiftNames,
    today,
    shift,
    setShift,
    leads,
    leadId,
    setLeadId,
    actorName,
    actorLeadId: isKitchen ? leadId : null,
    theme,
    setTheme,
    canViewScores,
    myLeadId,
    toast,
    ensureActor,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </AppContext.Provider>
  );
}
