import type { Move } from '@elomental/engine';
import { readJson, writeJson } from '../storage.ts';
import { auditServerGame, finishServerGame } from './games.ts';

/**
 * Results that never reached the server (full review H3). A signed-in game that finishes
 * with no connection is kept on this phone and sent again: on launch, when the connection
 * comes back, and before any new game starts (so the next Ranked start can't forfeit a
 * solved game as a loss). Once the server has answered, counted or refused, it's dropped.
 */

interface PendingResult {
  gameId: string;
  /** A Ranked win is audited (its moves replayed) before it's sent. */
  ranked: boolean;
  won: boolean;
  mistakes: number;
  hints: number;
  seconds: number;
  rating: number;
  grid: string;
  puzzle: string;
  moves: Move[];
}

const PENDING_KEY = 'elomental:pending-results';

export const pendingResults = (): PendingResult[] => readJson<PendingResult[]>(PENDING_KEY) ?? [];

/** Kept before it's sent (a phone can close mid-send), dropped once the server has answered. */
export function keepPending(result: PendingResult): void {
  writeJson(PENDING_KEY, [...pendingResults().filter((r) => r.gameId !== result.gameId), result]);
}

export function dropPending(gameId: string): void {
  writeJson(PENDING_KEY, pendingResults().filter((r) => r.gameId !== gameId));
}

/** Results the game screen is sending right now (the flush leaves them alone). */
const sending = new Set<string>();
export function markSending(gameId: string, on: boolean): void {
  if (on) sending.add(gameId);
  else sending.delete(gameId);
}

let flushing: Promise<{ sent: number; left: number; refused: string[] }> | null = null;

/**
 * Sends every kept result, oldest first. `sent` were counted; `left` still have no
 * connection; `refused` are the server's reasons for ones it wouldn't count (e.g. already
 * counted, when its first answer was lost on the way back).
 */
export function flushPending(): Promise<{ sent: number; left: number; refused: string[] }> {
  flushing ??= (async () => {
    let sent = 0;
    const refused: string[] = [];
    for (const r of pendingResults()) {
      if (sending.has(r.gameId)) continue;
      if (r.ranked && r.won) await auditServerGame(r.gameId, r.puzzle, r.moves);
      const answer = await finishServerGame({
        gameId: r.gameId,
        won: r.won,
        mistakes: r.mistakes,
        hints: r.hints,
        seconds: r.seconds,
        rating: r.rating,
        grid: r.grid,
      });
      if ('offline' in answer) continue;
      if ('outcome' in answer) sent++;
      else refused.push(answer.refused);
      dropPending(r.gameId);
    }
    return { sent, left: pendingResults().filter((r) => !sending.has(r.gameId)).length, refused };
  })().finally(() => (flushing = null));
  return flushing;
}
