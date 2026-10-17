import type { Difficulty, ProfileId } from '@elomental/engine';
import { cachedAccount } from './backend.ts';
import { readJson, writeJson } from './storage.ts';

/**
 * PROTOTYPE ONLY: progress, Elo and rewards live in localStorage so the game
 * can be felt end to end. In the real app every number here is computed
 * and stored by Supabase, never trusted from the browser.
 */

/** `clash` plays like Casual (no Elo) on a puzzle shared by code with a friend. */
export type Mode = 'casual' | 'daily' | 'ranked' | 'clash';

export interface Profile {
  guest: boolean;
  name: string;
  elo: number;
  rankedGames: number;
  dust: number;
  crowns: number;
  /** Wins since the last rare drop; a drop is guaranteed at PITY_LIMIT. */
  pity: number;
  /** Completed daily squares, keyed YYYY-MM-DD. */
  daily: Record<string, true>;
}

const KEY = 'elomental:profile';

export const START_ELO = 100;
/** Below this rating, losing a ranked match costs nothing. */
export const PROTECTED_BELOW = 500;
const DROP_CHANCE = 0.03;
const PITY_LIMIT = 40;

const DUST: Record<Difficulty | 'daily' | 'ranked', number> = { easy: 4, medium: 8, hard: 15, daily: 12, ranked: 20 };

/** Par solve time per ranked tier. The clock always counts up; speed against par scales Elo gains. */
export const PAR_MS: Record<Difficulty, number> = {
  easy: 6 * 60_000,
  medium: 12 * 60_000,
  hard: 20 * 60_000,
};

/**
 * Each hint used in a ranked game cuts the Elo gain by this fraction, so two
 * players who finish the same square in the same time don't earn the same if
 * one of them leaned on hints (3 hints keep only a quarter of the gain).
 * Losses are never made bigger by hints.
 */
export const HINT_ELO_PENALTY = 0.25;

/** Multiplier bonus applied to a ranked Elo gain, e.g. 0.15 = +15%. */
export function speedBonus(elapsedMs: number, difficulty: Difficulty): number {
  const ratio = elapsedMs / PAR_MS[difficulty];
  if (ratio <= 0.5) return 0.25;
  if (ratio <= 0.75) return 0.15;
  if (ratio <= 1) return 0.1;
  if (ratio <= 2) return 0;
  return -0.25;
}

/** Signed in: the cached server profile (read-only here). Signed out: the local guest profile. */
export function loadProfile(): Profile {
  const account = cachedAccount();
  if (account) {
    return {
      guest: false,
      name: account.name,
      elo: account.elo,
      rankedGames: account.rankedGames,
      dust: account.stardust,
      crowns: account.crowns,
      pity: 0,
      daily: account.daily,
    };
  }
  return {
    elo: START_ELO,
    rankedGames: 0,
    dust: 0,
    crowns: 0,
    pity: 0,
    daily: {},
    ...readJson<Partial<Profile>>(KEY),
    guest: true,
    name: 'Guest',
  };
}

export function saveProfile(profile: Profile): void {
  writeJson(KEY, profile);
}

/**
 * Which puzzle shape a game gets. Casual, Clash and Daily are tuned to be
 * enjoyable (no expert techniques); only Ranked keeps climbing.
 *
 * Daily follows a weekly rhythm, never harder than Casual Medium:
 * Mon-Tue relaxed, Wed-Thu leaner (more scanning), Fri-Sun a few pointing steps.
 */
export function puzzleProfile(mode: Mode, difficulty: Difficulty, dateKey?: string): ProfileId {
  if (mode === 'ranked') return difficulty;
  if (mode === 'daily') {
    const [y, m, d] = (dateKey ?? '').split('-').map(Number);
    const weekday = dateKey ? new Date(y, m - 1, d).getDay() : 1; // 0 = Sunday
    if (weekday === 1 || weekday === 2) return 'casualEasy';
    if (weekday === 3 || weekday === 4) return 'singlesLean';
    return 'casualMedium';
  }
  return difficulty === 'easy' ? 'casualEasy' : difficulty === 'medium' ? 'casualMedium' : 'casualHard';
}

/** Ranked puzzles get harder as the player's rating climbs. */
export function rankedDifficulty(elo: number): Difficulty {
  if (elo < 300) return 'easy';
  if (elo < 750) return 'medium';
  return 'hard';
}

/** Puzzle-as-opponent Elo. Provisional players move faster; losses are free while protected. */
export function eloDelta(player: number, puzzle: number, won: boolean, gamesPlayed: number): number {
  const expected = 1 / (1 + 10 ** ((puzzle - player) / 400));
  const k = gamesPlayed < 20 ? 40 : 24;
  const delta = Math.round(k * ((won ? 1 : 0) - expected));
  return delta < 0 && player < PROTECTED_BELOW ? 0 : delta;
}

export function rankTitle(elo: number): string {
  if (elo < 300) return 'Novice';
  if (elo < 600) return 'Apprentice';
  if (elo < 900) return 'Adept';
  if (elo < 1200) return 'Elementalist';
  return 'Archmage';
}

/** The daily square rolls over at 3 AM local time. */
export function dailyKey(now = new Date()): string {
  const shifted = new Date(now.getTime() - 3 * 3_600_000);
  return dateKey(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());
}

export const dateKey = (year: number, month: number, day: number): string =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export function nextResetIn(now = new Date()): number {
  const reset = new Date(now);
  reset.setHours(3, 0, 0, 0);
  if (reset.getTime() <= now.getTime()) reset.setDate(reset.getDate() + 1);
  return reset.getTime() - now.getTime();
}

export interface ResultInput {
  mode: Mode;
  difficulty: Difficulty;
  rating: number;
  dateKey?: string;
  won: boolean;
  mistakes: number;
  hints: number;
  elapsedMs: number;
}

export interface Outcome {
  dust: number;
  crown: boolean;
  elo?: { before: number; after: number; protectedLoss: boolean; bonus: number; hintCut: number };
  daily?: { done: number; days: number; monthComplete: boolean };
}

export function recordResult(input: ResultInput): Outcome {
  const profile = loadProfile();
  const outcome: Outcome = { dust: 0, crown: false };

  if (input.won) {
    const base = input.mode === 'casual' || input.mode === 'clash' ? DUST[input.difficulty] : DUST[input.mode];
    outcome.dust = Math.max(1, base - input.mistakes * 2 - input.hints);
    profile.dust += outcome.dust;
    profile.pity++;
    if (profile.pity >= PITY_LIMIT || Math.random() < DROP_CHANCE) {
      outcome.crown = true;
      profile.crowns++;
      profile.pity = 0;
    }
  }

  if (input.mode === 'ranked') {
    const before = profile.elo;
    let delta = eloDelta(before, input.rating, input.won, profile.rankedGames);
    const gained = input.won && delta > 0;
    const bonus = gained ? speedBonus(input.elapsedMs, input.difficulty) : 0;
    // Speed bonus first, then the hint cut, so hints can't be "earned back" by speed alone.
    const hintCut = gained ? Math.min(1, input.hints * HINT_ELO_PENALTY) : 0;
    delta = Math.round(delta * (1 + bonus) * (1 - hintCut));
    profile.elo = Math.max(0, before + delta);
    profile.rankedGames++;
    outcome.elo = { before, after: profile.elo, protectedLoss: !input.won && delta === 0, bonus, hintCut };
  }

  if (input.mode === 'daily' && input.dateKey) {
    if (input.won) profile.daily[input.dateKey] = true;
    const [year, month] = input.dateKey.split('-').map(Number);
    const days = new Date(year, month, 0).getDate();
    let done = 0;
    for (let d = 1; d <= days; d++) if (profile.daily[dateKey(year, month - 1, d)]) done++;
    outcome.daily = { done, days, monthComplete: done === days };
  }

  saveProfile(profile);
  return outcome;
}
