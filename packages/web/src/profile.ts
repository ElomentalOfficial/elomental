import { RANKED_STAGES, rankedStage, type Difficulty, type ProfileId, type RankedStage } from '@elomental/engine';
import { cachedAccount } from './backend.ts';
import { readJson, writeJson } from './storage.ts';
import * as copy from './copy/en.ts';
import { PROTECTED_BELOW, along, eloDelta, rankedOpponent } from './elo.ts';
import type { XpGain } from './level.ts';

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
  /** The rank shown, 0 Novice … 4 Elomental (kept until Elo is 50 below it). */
  tier: number;
  /** Ranked losses in a row: from 2, the next square is a stage easier. */
  lossRun: number;
  rankedGames: number;
  dust: number;
  /** Spirits (server only: a local guest earns none). */
  spirits: number;
  /** Completed daily squares, keyed YYYY-MM-DD. */
  daily: Record<string, true>;
}

const KEY = 'elomental:profile';

const START_ELO = 100;
// The Elo maths lives in elo.ts (no browser imports, so the database tests can compare it)
export { eloDelta, rankedOpponent } from './elo.ts';

const DUST: Record<Difficulty | 'daily' | 'ranked', number> = { easy: 4, medium: 8, hard: 15, daily: 12, ranked: 20 };

/**
 * Par solve time for a ranked puzzle, from its rating: 10 minutes up to a 400 rating,
 * rising to 15 at 730 and above (full review D5: a Ranked square takes 10–15 minutes).
 * The clock always counts up; speed against par scales Elo gains. Mirrors
 * private.par_seconds on the server.
 */
export function parMs(rating: number): number {
  return Math.min(Math.max(240 + Math.round(0.9 * rating), 600), 900) * 1000;
}

/**
 * Each hint used in a ranked game cuts the Elo gain by this fraction, so two
 * players who finish the same square in the same time don't earn the same if
 * one of them leaned on hints (3 hints keep only a quarter of the gain).
 * Losses are never made bigger by hints.
 */
export const HINT_ELO_PENALTY = 0.25;

/** Multiplier bonus applied to a ranked Elo gain, e.g. 0.15 = +15%. */
function speedBonus(elapsedMs: number, rating: number): number {
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
      // a guest account already has its own name from the server ("Calm Sage"): show it
      name: account.name || copy.common.guest,
      title: account.anonymous ? null : (account.title ?? null),
      elo: account.elo,
      tier: account.tier ?? shownTier(account.elo),
      lossRun: account.lossRun ?? 0,
      rankedGames: account.rankedGames,
      dust: account.stardust,
      spirits: account.spirits ?? 0,
      // filled-in days count for the month, like solved ones (the server counts them too)
      daily: { ...account.mended, ...account.daily },
    };
  }
  const local = {
    elo: START_ELO,
    rankedGames: 0,
    lossRun: 0,
    dust: 0,
    spirits: 0,
    daily: {},
    ...readJson<Partial<Profile>>(KEY),
    guest: true,
    name: copy.common.guest,
    title: null,
  };
  // a guest profile from before the ladder (no rank stored) moves onto the new scale, as accounts did
  if (local.tier === undefined) local.elo = ladderV2(local.elo);
  return { ...local, tier: local.tier ?? shownTier(local.elo) };
}

/** The one-time move onto the ladder's scale (migration ranked_ladder's ladder_v2). */
function ladderV2(old: number): number {
  const points: [number, number][] = [[100, 100], [500, 460], [1000, 830], [2000, 1330], [3000, 1610], [4800, 1700]];
  return old <= 100 ? old : Math.round(along(points, old));
}

function saveProfile(profile: Profile): void {
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

/** The run of losses after which the next Ranked square is a stage easier (the comeback square). */
const COMEBACK_AFTER = 2;

/**
 * The stage a Ranked game deals (engine RANKED_STAGES): the Elo's own, or one lower after two
 * losses in a row where losses cost Elo, until a win. Mirrors start_game (signed-in players get
 * it from there).
 */
export function rankedStageFor(elo: number, lossRun: number): number {
  const stage = rankedStage(elo);
  return lossRun >= COMEBACK_AFTER && elo >= PROTECTED_BELOW && stage > 0 ? stage - 1 : stage;
}

/** The engine rating a stage stands for: par goes by it. Mirrors private.stage_rating. */
export const stageRating = (stage: number): number => RANKED_STAGES[stage].rating;

/** The rating a Ranked square at this Elo stands for (its stage's). Mirrors private.ranked_target. */
export const rankedTarget = (elo: number): number => stageRating(rankedStage(elo));

/**
 * The five ranks by the Elo they start at, names only (docs/review/elo-ladder-2026-10-21-economy.md):
 * each is one technique family of Ranked squares. Mirrors private.tier_floors.
 */
const TIERS = [0, 300, 600, 1000, 1450];
/** A rank is kept until Elo is this far below its floor. Mirrors private.shown_tier. */
const RANK_GRACE = 50;

export interface RankTier {
  /** 0 Novice … 4 Elomental. */
  tier: number;
  /** "Adept". */
  label: string;
}

/** The rank an Elo reaches, before any grace. */
const tierOf = (elo: number): number => TIERS.filter((floor) => elo >= floor).length - 1;

/**
 * The rank shown: up as soon as Elo reaches a floor, down only once it is RANK_GRACE below the
 * rank held. Mirrors private.shown_tier. Without the held rank (`prev`), the Elo's own.
 */
function shownTier(elo: number, prev?: number | null): number {
  const now = tierOf(elo);
  if (prev == null || now >= prev) return now;
  return elo >= TIERS[prev] - RANK_GRACE ? prev : now;
}

/** The rank to show: the server's (the grace included) when it's known, else the Elo's own. */
export function rankTier(elo: number, tier?: number | null): RankTier {
  const t = tier == null ? tierOf(elo) : Math.min(Math.max(tier, 0), TIERS.length - 1);
  return { tier: t, label: copy.common.ranks[t] };
}

/**
 * The next rank up and how far it is: `gap` Elo, and `share` of the way from the current rank's
 * floor (0..1, for the bar). Null at Elomental, the top.
 */
export function nextRank(elo: number, tier?: number | null): { label: string; gap: number; share: number } | null {
  const t = rankTier(elo, tier).tier;
  if (t >= TIERS.length - 1) return null;
  const from = TIERS[t];
  const to = TIERS[t + 1];
  const e = Math.floor(elo);
  return { label: copy.common.ranks[t + 1], gap: to - e, share: Math.min(Math.max((e - from) / (to - from), 0), 1) };
}

/** A step up in rank, between the ranks shown before and after a game. */
export const promoted = (before: number, after: number): boolean => after > before;

/** Technique families a Ranked stage brings in, from the stage dealt: the first time, a note on the result. */
export const stageIntroduces = (stage: number): RankedStage['introduces'] => RANKED_STAGES[stage]?.introduces;

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

interface ResultInput {
  mode: Mode;
  difficulty: Difficulty;
  rating: number;
  /** Ranked: the rating the square aimed for (par goes by it). */
  target?: number;
  /** Ranked: the stage it was dealt at. */
  stage?: number;
  dateKey?: string;
  won: boolean;
  mistakes: number;
  hints: number;
  elapsedMs: number;
}

export interface Outcome {
  dust: number;
  /** A Spirit dropped (server only; rolled on the solves that count toward parts). */
  spirit: boolean;
  /**
   * `unrated`: a Ranked win that earned no Elo or speed bonus, because its
   * squares went in before they could be worked out ('copied') or the server
   * couldn't check the solve ('unchecked').
   */
  elo?: {
    before: number;
    after: number;
    protectedLoss: boolean;
    bonus: number;
    hintCut: number;
    unrated?: Unrated | null;
    /** The rank shown before and after the game (0 Novice … 4 Elomental). */
    tierBefore?: number;
    tier?: number;
    /** The stage this game dealt, when it went by stage. */
    stage?: number | null;
    /** The next square is a stage easier: two losses in a row. */
    comeback?: boolean;
  };
  /** The Daily month: days done, its length, the days its badge needs; badgeNew on the solve that earns it (server only). */
  daily?: DailyMonth;
  /** A part dropped by this solve (every 3rd rated solve; signed-in players only; reward.ts shows it). */
  drop?: Drop;
  /** Rated solves toward the next part: count of every (e.g. 1 of 3). */
  progress?: { count: number; every: number };
  /** Influence added to the player's affinity this solve. */
  influence?: { affinity: Element; amount: number };
  /** The day's 9 counted solves are used up: no part progress until tomorrow (server only). */
  partsCapped?: boolean;
  /** Casual/Clash past the first 20 solves of the day pay 1 Stardust (server only). */
  dustCapped?: boolean;
  /** XP from a win, and the level it leaves (server only; level.ts). */
  xp?: XpGain;
  /** The worn frame earned a mark with this win (mark_moment): which, and how many it has now. */
  mark?: { part: string; marks: number };
}

/** Why a Ranked win earned no Elo (finish_game): see copy.result.unrated. */
export type Unrated = 'copied' | 'unchecked' | 'restricted' | 'too_quick';

export interface DailyMonth {
  done: number;
  days: number;
  need?: number;
  monthComplete: boolean;
  badge?: string;
  badgeNew?: boolean;
}

/** Days of a month the Daily badge needs (server daily_month: least(days, 20), so 20). */
export const dailyBadgeNeed = (days: number): number => Math.min(days, 20);

/** What a month's Daily count is out of: the badge's 20 until it's earned, then the whole month. */
export const dailyGoal = (done: number, days: number): number => (done < dailyBadgeNeed(days) ? dailyBadgeNeed(days) : days);

export type Element = 'fire' | 'water' | 'earth' | 'air';
export type Rarity = 'common' | 'rare' | 'epic' | 'mythic';
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'mythic'];
export const ELEMENTS: Element[] = ['fire', 'water', 'earth', 'air'];

export interface Drop {
  rarity: Rarity;
  /** The part's id ("s0-avatar-calm", "s0-frame-gold"). */
  part: string;
  /** Already yours: turned into `stardust` instead. */
  duplicate: boolean;
  stardust: number;
  /** Which guarantee brought it, if any. */
  pity: 'epic' | 'mythic' | null;
  /** It came as a blueprint (blueprints), to forge for `forge` Stardust. */
  blueprint?: boolean;
  forge?: number | null;
  /** Parts left until each guarantee. */
  guarantee: { epic: number; mythic: number };
  /** Every part of that rarity is owned (economy_pace): its guarantee only brings Stardust. */
  complete?: { epic: boolean; mythic: boolean };
}
export function recordResult(input: ResultInput): Outcome {
  const profile = loadProfile();
  const outcome: Outcome = { dust: 0, spirit: false };

  if (input.won) {
    const base = input.mode === 'casual' || input.mode === 'clash' ? DUST[input.difficulty] : DUST[input.mode];
    outcome.dust = Math.max(1, base - input.mistakes * 2 - input.hints);
    profile.dust += outcome.dust;
  }

  if (input.mode === 'ranked') {
    const before = profile.elo;
    // priced as an even match against your own Elo, whatever the square's rating; par goes by
    // the stage's target. Mirrors finish_game (ranked_elo).
    const target = input.target ?? rankedTarget(before);
    let delta = eloDelta(before, rankedOpponent(before), input.won);
    const gained = input.won && delta > 0;
    const bonus = gained ? speedBonus(input.elapsedMs, target) : 0;
    // Speed bonus first, then the hint cut, so hints can't be "earned back" by speed alone.
    const hintCut = gained ? Math.min(1, input.hints * HINT_ELO_PENALTY) : 0;
    delta = Math.round(delta * (1 + bonus) * (1 - hintCut));
    profile.elo = Math.max(0, before + delta);
    profile.rankedGames++;
    const tierBefore = profile.tier;
    profile.tier = shownTier(profile.elo, tierBefore);
    profile.lossRun = input.won ? 0 : Math.min(profile.lossRun + 1, 9);
    outcome.elo = {
      before, after: profile.elo, protectedLoss: !input.won && delta === 0, bonus, hintCut,
      tierBefore, tier: profile.tier, stage: input.stage ?? null,
      comeback: rankedStageFor(profile.elo, profile.lossRun) < rankedStage(profile.elo),
    };
  }

  if (input.mode === 'daily' && input.dateKey) {
    if (input.won) profile.daily[input.dateKey] = true;
    const [year, month] = input.dateKey.split('-').map(Number);
    const days = new Date(year, month, 0).getDate();
    let done = 0;
    for (let d = 1; d <= days; d++) if (profile.daily[dateKey(year, month - 1, d)]) done++;
    // (a guest playing offline earns no badge: badges live on the server)
    outcome.daily = { done, days, need: dailyBadgeNeed(days), monthComplete: done >= dailyBadgeNeed(days) };
  }

  saveProfile(profile);
  return outcome;
}
