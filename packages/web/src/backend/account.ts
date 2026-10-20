import type { Session } from '@supabase/supabase-js';
import type { Element } from '../profile.ts';
import { applySettings, cleanSettings, localSettings, type Settings } from '../settings.ts';
import { readJson, removeKey, writeJson } from '../storage.ts';
import { captchaToken } from './captcha.ts';
import { supabase } from './client.ts';
import * as copy from '../copy/en.ts';

// --- Account cache ------------------------------------------------------------
// The home screen renders synchronously, so the last known server profile is
// kept locally and refreshed in the background.

export interface Account {
  /** A guest account: no email yet; signing up keeps its progress. */
  anonymous: boolean;
  email: string;
  name: string;
  /** A fixed title (e.g. "Founder") shown instead of the Elo rank, if the account has one. */
  title: string | null;
  /** When the name may next be changed (ISO), or null if it can change now. */
  nextNameChange: string | null;
  elo: number;
  rankedGames: number;
  stardust: number;
  crowns: number;
  /** Won daily squares, keyed YYYY-MM-DD. */
  daily: Record<string, true>;
  /** The element the player fights for (null until chosen, after 3 solves). */
  affinity: Element | null;
  /** Squares solved, all modes. */
  solved: number;
}

const ACCOUNT_KEY = 'elomental:account';

export const cachedAccount = (): Account | null => readJson<Account>(ACCOUNT_KEY);
/** Games go through the server (an email account or an anonymous guest account). */
export const signedIn = (): boolean => cachedAccount() !== null;
/** Has a real (email) account; guests and anonymous accounts don't. */
export const registered = (): boolean => {
  const account = cachedAccount();
  return !!account && !account.anonymous;
};
/** A founder (the server decides; this only picks whether to show the way into Review). */
export const isFounder = (): boolean => cachedAccount()?.title === 'Founder';

const listeners = new Set<() => void>();
/** Called whenever the account (or signed-in state) changes. */
export function onAccountChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn());

/** Re-reads the profile and won daily squares from the server into the cache. */
export async function refreshAccount(session?: Session | null): Promise<Account | null> {
  const s = session ?? (await supabase.auth.getSession()).data.session;
  if (!s) {
    if (cachedAccount()) {
      removeKey(ACCOUNT_KEY);
      notify();
    }
    return null;
  }
  const [{ data: profile, error }, { data: dailies }, { count: solved }] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, title, name_changed_at, elo, ranked_games, stardust, crowns, settings, affinity')
      .eq('id', s.user.id)
      .single(),
    supabase.from('games').select('date_key').eq('mode', 'daily').eq('won', true),
    supabase.from('games').select('id', { count: 'exact', head: true }).eq('won', true),
  ]);
  if (error || !profile) return cachedAccount();
  syncSettings(profile.settings);
  const account: Account = {
    anonymous: !!s.user.is_anonymous,
    email: s.user.email ?? '',
    name: profile.display_name,
    title: profile.title ?? null,
    nextNameChange: nextChange(profile.name_changed_at),
    elo: profile.elo,
    rankedGames: profile.ranked_games,
    stardust: profile.stardust,
    crowns: profile.crowns,
    daily: Object.fromEntries((dailies ?? []).map((d) => [d.date_key as string, true as const])),
    affinity: (profile.affinity ?? null) as Element | null,
    solved: solved ?? 0,
  };
  writeJson(ACCOUNT_KEY, account);
  notify();
  return account;
}

/** Starts listening for sign-in / sign-out (including a magic link landing on this page). */
export function initBackend(): void {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      removeKey(ACCOUNT_KEY);
      notify();
    } else if (event === 'INITIAL_SESSION' && !session) {
      // First launch (or after signing out): become an anonymous guest account.
      setTimeout(() => void startGuestAccount(), 0);
    } else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
      // Outside the callback: supabase-js must not be awaited from inside it.
      setTimeout(() => void refreshAccount(session), 0);
    }
  });
}

/** Anonymous account for a guest; quietly stays a local guest if that's off or offline. */
export async function startGuestAccount(): Promise<void> {
  // Opened from an email link: that link signs this browser in (signIn.ts), and a
  // guest account starting at the same time could land after it and replace it.
  if (new URLSearchParams(location.search).has('token_hash')) return;
  const { error } = await supabase.auth.signInAnonymously({ options: { captchaToken: await captchaToken() } });
  if (error) console.info('Playing as a local guest:', error.message);
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  removeKey(ACCOUNT_KEY);
  notify();
  // Back to a fresh guest account, so play keeps going through the server.
  void startGuestAccount();
}

// --- Settings ------------------------------------------------------------------------

/**
 * Changes settings on this device and saves them to the account, so every
 * other device picks them up on its next refresh. Offline, the change stays
 * on this device.
 */
export function saveSettings(settings: Partial<Settings>): void {
  applySettings(settings);
  if (signedIn()) void supabase.rpc('save_settings', { p_settings: settings }).then(() => undefined);
}

/**
 * The account's saved settings win over this device's. Settings the account
 * hasn't saved yet (a new account, or one from before settings synced) are
 * filled in from this device.
 */
function syncSettings(raw: unknown): void {
  const saved = cleanSettings(raw);
  applySettings(saved);
  const local = localSettings();
  const fill: Partial<Settings> = {};
  for (const k of Object.keys(local) as (keyof Settings)[]) {
    if (k !== 'a11y' && !(k in saved)) Object.assign(fill, { [k]: local[k] });
  }
  // Accessibility choices merge key by key: send only the ones the account hasn't saved.
  const a11yMissing = Object.fromEntries(Object.entries(local.a11y).filter(([k]) => !(k in (saved.a11y ?? {}))));
  if (Object.keys(a11yMissing).length) fill.a11y = a11yMissing;
  if (Object.keys(fill).length) void supabase.rpc('save_settings', { p_settings: fill }).then(() => undefined);
}

// --- Player name ---------------------------------------------------------------------

/** Names can change once every 15 days (the server enforces it). */
export const NAME_COOLDOWN_DAYS = 15;

function nextChange(changedAt: string | null): string | null {
  if (!changedAt) return null;
  const next = Date.parse(changedAt) + NAME_COOLDOWN_DAYS * 86_400_000;
  return next > Date.now() ? new Date(next).toISOString() : null;
}

export const formatDay = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });

/** Null when saved, otherwise why not. */
export async function setDisplayName(name: string): Promise<string | null> {
  const { error } = await supabase.rpc('set_display_name', { p_name: name });
  if (error) {
    const cooldown = error.message.match(/name_cooldown:(\S+)/);
    if (cooldown) return copy.account.nameAgainOn(formatDay(cooldown[1]));
    if (error.message.includes('name_taken')) return copy.account.nameTaken;
    return copy.account.nameRules;
  }
  await refreshAccount();
  return null;
}
