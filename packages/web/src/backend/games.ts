import type { Difficulty, Move } from '@elomental/engine';
import type { Drop, Element, Mode, Outcome } from '../profile.ts';
import { refreshAccount } from './account.ts';
import { knownError, supabase } from './client.ts';
import * as copy from '../copy/en.ts';

/**
 * The server side of every signed-in game. The browser never writes
 * progress: start_game picks the seed and starts the clock; finish_game
 * checks the grid and pays out Stardust and Elo (supabase/migrations).
 */

export interface ServerStart {
  gameId: string;
  seed: string;
  difficulty: Difficulty;
  /** Ranked: the rating the puzzle must aim for (from the player's Elo). */
  targetRating?: number;
  resumed: boolean;
}

/** A game the server won't start, with the reason to show the player. */
export class GameRefused extends Error {}


/** Throws GameRefused (with the player-facing reason) or, for anything else, a plain Error. */
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
    const refusal = knownError(error, copy.refusals.start);
    throw refusal ? new GameRefused(refusal) : new Error(error.message);
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

/**
 * Ranked/Clash pause: the server stops counting (each pause free for up to 5
 * minutes, 3 per game). Returns pauses left, or null when none are left.
 */
export async function pauseServerGame(gameId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('pause_game', { p_game_id: gameId });
  if (error) return error.message.includes('no_pauses_left') ? null : 0;
  return (data as { pauses_left: number }).pauses_left;
}

export async function resumeServerGame(gameId: string): Promise<void> {
  await supabase.rpc('resume_game', { p_game_id: gameId });
}

/**
 * Ranked: sends the solve's moves to the audit-solve Edge Function, which
 * replays them and records whether the squares were worked out or typed in
 * from a solved grid. finish_game then rates the win only if it was worked
 * out. Tried twice; if it still fails, the win stays unrated.
 */
export async function auditServerGame(gameId: string, givens: string, moves: Move[]): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await supabase.functions.invoke('audit-solve', { body: { gameId, givens, moves } });
    if (!error) return;
  }
}

export interface ServerFinish {
  outcome: Outcome;
  seconds: number;
}

/** Settles the game on the server; `refused` with the reason to show when it wasn't counted. */
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
    return { refused: knownError(error, copy.refusals.finish) ?? copy.refusals.finishOffline };
  }
  const d = data as {
    seconds: number;
    dust: number;
    crown: boolean;
    elo: { before: number; after: number; protectedLoss: boolean; bonus: number; hintCut: number; unrated?: 'copied' | 'unchecked' | null } | null;
    daily: { done: number; days: number; monthComplete: boolean } | null;
    drop?: Drop | null;
    progress?: { count: number; every: number } | null;
    influence?: { affinity: Element; amount: number } | null;
  };
  void refreshAccount();
  return {
    seconds: d.seconds,
    outcome: {
      dust: d.dust,
      crown: d.crown,
      elo: d.elo ? { ...d.elo, bonus: Number(d.elo.bonus), hintCut: Number(d.elo.hintCut) } : undefined,
      daily: d.daily ?? undefined,
      drop: d.drop ?? undefined,
      progress: d.progress ?? undefined,
      influence: d.influence ?? undefined,
    },
  };
}
