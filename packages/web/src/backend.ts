import { createClient, type Session } from '@supabase/supabase-js';
import type { Difficulty } from '@elomental/engine';
import type { ClashResult } from './clash.ts';
import type { Mode, Outcome } from './profile.ts';
import { readJson, removeKey, writeJson } from './storage.ts';

/**
 * Supabase: passwordless accounts (email code / magic link) and the server
 * side of every signed-in game. The browser never writes progress; it calls
 * start_game / finish_game, which pick the seed, keep the clock, check the
 * grid and pay out Stardust and Elo (supabase/migrations).
 *
 * Guests get an anonymous account on first launch (when the project allows
 * anonymous sign-ins), so their games are server-settled from the start and
 * signing up with an email keeps every reward. Without one (offline, or
 * anonymous sign-ins off) they play on the local prototype profile.
 */

// Public by design: the publishable key only reaches what RLS and the grants allow.
const SUPABASE_URL = 'https://xekeiwaxxsmvalezgtyj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_n7EsqEfzlcUCn6GI7YFdxw_Y74WqUwT';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // A magic link opened on this device signs it in from the URL.
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
});

// --- Account cache ------------------------------------------------------------
// The home screen renders synchronously, so the last known server profile is
// kept locally and refreshed in the background.

export interface Account {
  /** A guest account: no email yet; signing up keeps its progress. */
  anonymous: boolean;
  email: string;
  name: string;
  /** When the name may next be changed (ISO), or null if it can change now. */
  nextNameChange: string | null;
  elo: number;
  rankedGames: number;
  stardust: number;
  crowns: number;
  /** Won daily squares, keyed YYYY-MM-DD. */
  daily: Record<string, true>;
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
  const [{ data: profile, error }, { data: dailies }] = await Promise.all([
    supabase.from('profiles').select('display_name, name_changed_at, elo, ranked_games, stardust, crowns').eq('id', s.user.id).single(),
    supabase.from('games').select('date_key').eq('mode', 'daily').eq('won', true),
  ]);
  if (error || !profile) return cachedAccount();
  const account: Account = {
    anonymous: !!s.user.is_anonymous,
    email: s.user.email ?? '',
    name: profile.display_name,
    nextNameChange: nextChange(profile.name_changed_at),
    elo: profile.elo,
    rankedGames: profile.ranked_games,
    stardust: profile.stardust,
    crowns: profile.crowns,
    daily: Object.fromEntries((dailies ?? []).map((d) => [d.date_key as string, true as const])),
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
async function startGuestAccount(): Promise<void> {
  const { error } = await supabase.auth.signInAnonymously();
  if (error) console.info('Playing as a local guest:', error.message);
}

// --- Sign-in: email code or magic link -----------------------------------------

/**
 * How the pending code will be checked: 'email' signs in (or creates) an
 * account; 'email_change' attaches the email to the current anonymous guest
 * account, which keeps all of its progress.
 */
let pendingCodeType: 'email' | 'email_change' = 'email';

/**
 * Emails a one-time code and a magic link. A guest account is upgraded in
 * place; an email that already has an account signs into that account instead
 * (`switched`, and the guest's progress stays behind).
 */
export async function sendSignInEmail(email: string): Promise<{ error: string | null; switched?: boolean }> {
  const redirect = `${location.origin}${location.pathname}`;
  if (cachedAccount()?.anonymous) {
    const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: redirect });
    if (!error) {
      pendingCodeType = 'email_change';
      return { error: null };
    }
    if (!/already|registered|exists/i.test(error.message)) return { error: friendlyAuthError(error.message) };
  }
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: redirect } });
  pendingCodeType = 'email';
  return { error: error ? friendlyAuthError(error.message) : null, switched: !!cachedAccount()?.anonymous };
}

/**
 * After a guest asks to attach an email: resolves once the link in the email
 * has been tapped, wherever it opened (Safari included). The confirmation
 * lands on the server, so this account just re-reads itself until the email
 * is on it, then refreshes its session to become a registered account.
 */
export async function waitForEmailConfirmation(email: string, isCancelled: () => boolean): Promise<boolean> {
  const wanted = email.trim().toLowerCase();
  while (!isCancelled()) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    if (document.hidden) continue;
    // Signed in elsewhere in this browser (the link opened in another tab).
    if (registered()) return true;
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (user && user.email?.toLowerCase() === wanted && !user.is_anonymous) {
      await supabase.auth.refreshSession();
      await refreshAccount();
      return true;
    }
  }
  return false;
}

/** Signs in with a code from the email (only when the email template includes one). */
export async function verifyCode(email: string, code: string): Promise<string | null> {
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: pendingCodeType });
  if (error) return friendlyAuthError(error.message);
  await refreshAccount();
  return null;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  removeKey(ACCOUNT_KEY);
  notify();
  // Back to a fresh guest account, so play keeps going through the server.
  void startGuestAccount();
}

/** Names can change once every 15 days (the server enforces it). */
export const NAME_COOLDOWN_DAYS = 15;

function nextChange(changedAt: string | null): string | null {
  if (!changedAt) return null;
  const next = Date.parse(changedAt) + NAME_COOLDOWN_DAYS * 86_400_000;
  return next > Date.now() ? new Date(next).toISOString() : null;
}

export const formatDay = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });

export async function setDisplayName(name: string): Promise<string | null> {
  const { error } = await supabase.rpc('set_display_name', { p_name: name });
  if (error) {
    const cooldown = error.message.match(/name_cooldown:(\S+)/);
    if (cooldown) return `You can change your name again on ${formatDay(cooldown[1])}`;
    if (error.message.includes('name_taken')) return 'That name is taken';
    return 'Names are 3–20 letters, digits, spaces, . _ -';
  }
  await refreshAccount();
  return null;
}

function friendlyAuthError(message: string): string {
  if (/rate limit|too many|security purposes/i.test(message)) return 'Too many emails. Wait a minute and try again.';
  if (/expired|invalid/i.test(message)) return 'That code is wrong or expired';
  if (/email/i.test(message)) return 'Check the email address';
  return message;
}

// --- Games ------------------------------------------------------------------------

export interface ServerStart {
  gameId: string;
  seed: string;
  difficulty: Difficulty;
  /** Ranked: the rating the puzzle must aim for (from the player's Elo). */
  targetRating?: number;
  resumed: boolean;
}

export class GameRefused extends Error {}

const REFUSALS: Record<string, string> = {
  daily_done: "You've already played today's square",
  clash_played: "You've already played this clash",
  bad_date: 'Your clock looks off: check the date',
  bad_code: "That code isn't valid",
  not_signed_in: 'Sign in again to play',
};

export async function startServerGame(options: {
  mode: Mode;
  difficulty?: Difficulty;
  dateKey?: string;
  clashCode?: string;
}): Promise<ServerStart> {
  const { data, error } = await supabase.rpc('start_game', {
    p_mode: options.mode,
    p_difficulty: options.difficulty ?? null,
    p_date_key: options.dateKey ?? null,
    p_clash_code: options.clashCode ?? null,
  });
  if (error) {
    const key = Object.keys(REFUSALS).find((k) => error.message.includes(k));
    throw key ? new GameRefused(REFUSALS[key]) : new Error(error.message);
  }
  const d = data as { game_id: string; seed: string; difficulty: Difficulty; target_rating?: number | null; resumed: boolean };
  return {
    gameId: d.game_id,
    seed: d.seed,
    difficulty: d.difficulty,
    targetRating: d.target_rating ?? undefined,
    resumed: d.resumed,
  };
}

export interface ServerFinish {
  outcome: Outcome;
  seconds: number;
}

/** Settles the game on the server; returns null with a reason when it wasn't counted. */
export async function finishServerGame(input: {
  gameId: string;
  won: boolean;
  mistakes: number;
  hints: number;
  seconds: number;
  rating: number;
  grid: string;
}): Promise<ServerFinish | { refused: string }> {
  const { data, error } = await supabase.rpc('finish_game', {
    p_game_id: input.gameId,
    p_won: input.won,
    p_mistakes: input.mistakes,
    p_hints: input.hints,
    p_seconds: input.seconds,
    p_rating: input.rating,
    p_grid: input.grid,
  });
  if (error) {
    if (error.message.includes('too_fast')) return { refused: 'Solved faster than humanly possible: not counted' };
    if (error.message.includes('already_finished')) return { refused: 'This game was already settled' };
    if (error.message.includes('invalid_solution')) return { refused: "The grid didn't check out: not counted" };
    return { refused: 'No connection: this game was not saved to your account' };
  }
  const d = data as {
    seconds: number;
    dust: number;
    crown: boolean;
    elo: { before: number; after: number; protectedLoss: boolean; bonus: number; hintCut: number } | null;
    daily: { done: number; days: number; monthComplete: boolean } | null;
  };
  void refreshAccount();
  return {
    seconds: d.seconds,
    outcome: {
      dust: d.dust,
      crown: d.crown,
      elo: d.elo ? { ...d.elo, bonus: Number(d.elo.bonus), hintCut: Number(d.elo.hintCut) } : undefined,
      daily: d.daily ?? undefined,
    },
  };
}

// --- Clash -----------------------------------------------------------------------

export interface ServerClashEntry {
  name: string;
  isMe: boolean;
  result: ClashResult;
}

const toEntry = (row: {
  display_name: string;
  is_me: boolean;
  solved: boolean;
  seconds: number;
  mistakes: number;
  hints: number;
}): ServerClashEntry => ({
  name: row.display_name,
  isMe: row.is_me,
  result: { solved: row.solved, seconds: row.seconds, mistakes: row.mistakes, hints: row.hints },
});

/** Everyone's finished result for a code, oldest first. */
export async function fetchClash(code: string): Promise<ServerClashEntry[] | null> {
  const { data, error } = await supabase.rpc('get_clash', { p_code: code });
  return error ? null : (data ?? []).map(toEntry);
}

/** All clashes this account played, with every player's result, grouped by code. */
export async function fetchMyClashes(): Promise<
  Map<string, { difficulty: Difficulty; updated: number; entries: ServerClashEntry[] }> | null
> {
  const { data, error } = await supabase.rpc('my_clashes');
  if (error) return null;
  const byCode = new Map<string, { difficulty: Difficulty; updated: number; entries: ServerClashEntry[] }>();
  for (const row of data ?? []) {
    const group = byCode.get(row.code) ?? { difficulty: row.difficulty as Difficulty, updated: 0, entries: [] };
    group.entries.push(toEntry(row));
    group.updated = Math.max(group.updated, Date.parse(row.finished_at));
    byCode.set(row.code, group);
  }
  return byCode;
}
