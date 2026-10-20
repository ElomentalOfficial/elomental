import type { Difficulty, ProfileId } from '@elomental/engine';
import { cachedAccount } from './backend.ts';
import { readJson, writeJson } from './storage.ts';
import * as copy from './copy/en.ts';

/**
 * Player progress. With an account (guests get an anonymous one), every
 * number comes from the server, which settles each game (finish_game).
 * Without one (offline, or anonymous sign-ins turned off), a local guest
 * profile lives in localStorage and recordResult applies the same rules as
 * the server; the formulas below mirror the private.* functions there.
 */

/** `clash` plays like Casual (no Elo) on a puzzle shared by code with a friend. */
export type Mode = 'casual' | 'daily' | 'ranked' | 'clash';

export interface Profile {
  guest: boolean;
  name: string;
  /** Shown instead of the Elo rank (e.g. "Founder"); null for most players. */
  title: string | null;
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

/**
 * Par solve time for a ranked puzzle, from its rating: about 6 minutes at 150,
 * 12 at 550, 19 at 1000, 34 at 2000, capped at an hour. The clock always counts
 * up; speed against par scales Elo gains. Mirrors private.par_seconds on the server.
 */
export function parMs(rating: number): number {
  return Math.min(Math.max(240 + Math.round(0.9 * rating), 360), 3600) * 1000;
}

/**
 * Each hint used in a ranked game cuts the Elo gain by this fraction, so two
 * players who finish the same square in the same time don't earn the same if
 * one of them leaned on hints (3 hints keep only a quarter of the gain).
 * Losses are never made bigger by hints.
 */
export const HINT_ELO_PENALTY = 0.25;

/** Multiplier bonus applied to a ranked Elo gain, e.g. 0.15 = +15%. */
export function speedBonus(elapsedMs: number, rating: number): number {
  const ratio = elapsedMs / parMs(rating);
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
      guest: account.anonymous,
      name: account.anonymous ? copy.common.guest : account.name,
      title: account.anonymous ? null : (account.title ?? null),
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
    name: copy.common.guest,
    title: null,
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

/** Lowest and highest rating a ranked puzzle aims for. */
const MIN_TARGET = 150;
const MAX_TARGET = 4800;

/**
 * The rating a ranked puzzle aims for: the player's own Elo, so every match is
 * an even one and the puzzles keep getting harder as long as the player keeps
 * winning. Mirrors start_game on the server (signed-in players get it from there).
 */
export function rankedTarget(elo: number): number {
  return Math.min(Math.max(Math.round(elo), MIN_TARGET), MAX_TARGET);
}

/** K by Elo, straight lines between these points: big gains while learning, small at the top. */
const K_CURVE: [number, number][] = [
  [600, 60],
  [1600, 28],
  [2400, 16],
  [3200, 10],
  [4800, 8],
];

/** What a loss costs relative to the stake: gentle right after the protection, double at the top. */
const LOSS_CURVE: [number, number][] = [
  [500, 0.5],
  [1200, 1],
  [1600, 1.25],
  [2400, 1.5],
  [3200, 2],
];

/** Straight lines between the points; flat before the first and after the last. */
function along(points: [number, number][], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x0, y0] = points[i - 1];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}

/**
 * Puzzle-as-opponent Elo, mirroring elo_delta on the server (signed-in players
 * get theirs from there). Losses are free while protected, then cost more the
 * higher the player (LOSS_CURVE).
 */
export function eloDelta(player: number, puzzle: number, won: boolean): number {
  const expected = 1 / (1 + 10 ** ((puzzle - player) / 400));
  const k = along(K_CURVE, player);
  if (won) return Math.round(k * (1 - expected));
  if (player < PROTECTED_BELOW) return 0;
  return -Math.round(k * expected * along(LOSS_CURVE, player));
}

/**
 * Ranked tiers (docs/PROGRESSION_DESIGN.md §1.2): the five rank names spread over
 * the whole Elo range, each split into divisions III, II, I by the Elo they start
 * at. Archmage (3000+) has no divisions: its Elo speaks for itself.
 */
const TIERS: { from: number; divisions: number[] }[] = [
  { from: 0, divisions: [0, 200, 400] },
  { from: 600, divisions: [600, 800, 1000] },
  { from: 1200, divisions: [1200, 1450, 1700] },
  { from: 2000, divisions: [2000, 2350, 2700] },
  { from: 3000, divisions: [] },
];
const DIVISIONS = ['III', 'II', 'I'] as const;

export interface RankTier {
  /** 0 Novice … 4 Archmage. */
  tier: number;
  /** 0 = III, 1 = II, 2 = I; null for Archmage. */
  division: number | null;
  name: string;
  /** "Adept II", or "Archmage". */
  label: string;
}

export function rankTier(elo: number): RankTier {
  let tier = 0;
  while (tier < TIERS.length - 1 && elo >= TIERS[tier + 1].from) tier++;
  const { divisions } = TIERS[tier];
  let division: number | null = null;
  if (divisions.length) {
    division = 0;
    while (division < divisions.length - 1 && elo >= divisions[division + 1]) division++;
  }
  const name = copy.common.ranks[tier];
  return { tier, division, name, label: division === null ? name : copy.common.rankDivision(name, DIVISIONS[division]) };
}

/** A step up in tier or division, between two Elo ratings. */
export function promoted(before: number, after: number): boolean {
  const a = rankTier(before);
  const b = rankTier(after);
  return b.tier > a.tier || (b.tier === a.tier && (b.division ?? 0) > (a.division ?? 0));
}

export function rankTitle(elo: number): string {
  return rankTier(elo).label;
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
  /**
   * `unrated`: a Ranked win that earned no Elo or speed bonus, because its
   * squares went in before they could be worked out ('copied') or the server
   * couldn't check the solve ('unchecked').
   */
  elo?: { before: number; after: number; protectedLoss: boolean; bonus: number; hintCut: number; unrated?: 'copied' | 'unchecked' | null };
  daily?: { done: number; days: number; monthComplete: boolean };
  /** A part dropped by this solve (every 3rd rated solve; signed-in players only; reward.ts shows it). */
  drop?: Drop;
  /** Rated solves toward the next part: count of every (e.g. 1 of 3). */
  progress?: { count: number; every: number };
  /** Influence added to the player's affinity this solve. */
  influence?: { affinity: Element; amount: number };
}

export type Element = 'fire' | 'water' | 'earth' | 'air';
export type Rarity = 'common' | 'rare' | 'epic' | 'mythic';
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'mythic'];
export const ELEMENTS: Element[] = ['fire', 'water', 'earth', 'air'];

export interface Drop {
  rarity: Rarity;
  /** The part's id ("s0-sigil-fire-2"). */
  part: string;
  /** Already yours: turned into `stardust` instead. */
  duplicate: boolean;
  stardust: number;
  /** Which guarantee brought it, if any. */
  pity: 'epic' | 'mythic' | null;
  /** Parts left until each guarantee. */
  guarantee: { epic: number; mythic: number };
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
    let delta = eloDelta(before, input.rating, input.won);
    const gained = input.won && delta > 0;
    const bonus = gained ? speedBonus(input.elapsedMs, input.rating) : 0;
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
