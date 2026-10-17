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
 * Guests (signed out) keep playing on the local prototype profile.
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
  email: string;
  name: string;
  elo: number;
  rankedGames: number;
  stardust: number;
  crowns: number;
  /** Won daily squares, keyed YYYY-MM-DD. */
  daily: Record<string, true>;
}

const ACCOUNT_KEY = 'elomental:account';

export const cachedAccount = (): Account | null => readJson<Account>(ACCOUNT_KEY);
export const signedIn = (): boolean => cachedAccount() !== null;

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
    supabase.from('profiles').select('display_name, elo, ranked_games, stardust, crowns').eq('id', s.user.id).single(),
    supabase.from('games').select('date_key').eq('mode', 'daily').eq('won', true),
  ]);
  if (error || !profile) return cachedAccount();
  const account: Account = {
    email: s.user.email ?? '',
    name: profile.display_name,
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
    } else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
      // Outside the callback: supabase-js must not be awaited from inside it.
      setTimeout(() => void refreshAccount(session), 0);
    }
  });
}

// --- Sign-in: email code or magic link -----------------------------------------

/** Emails a one-time code and a magic link. Creates the account on first use. */
export async function sendSignInEmail(email: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${location.origin}${location.pathname}` },
  });
  return error ? friendlyAuthError(error.message) : null;
}

/** Signs in with the code from the email (works inside the home-screen app, unlike the link on iOS). */
export async function verifyCode(email: string, code: string): Promise<string | null> {
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
  return error ? friendlyAuthError(error.message) : null;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  removeKey(ACCOUNT_KEY);
  notify();
}

export async function setDisplayName(name: string): Promise<string | null> {
  const { error } = await supabase.rpc('set_display_name', { p_name: name });
  if (error) return error.message.includes('name_taken') ? 'That name is taken' : 'Names are 3–20 letters, digits, spaces, . _ -';
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
  const d = data as { game_id: string; seed: string; difficulty: Difficulty; resumed: boolean };
  return { gameId: d.game_id, seed: d.seed, difficulty: d.difficulty, resumed: d.resumed };
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
