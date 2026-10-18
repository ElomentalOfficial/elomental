import type { Difficulty } from '@elomental/engine';
import { copyText } from './clipboard.ts';
import { readJson, writeJson } from './storage.ts';
import { formatSeconds } from './ui.ts';

/**
 * Clash: race a friend on the same square.
 *
 * The 6-character code *is* the puzzle: it seeds the generator, so everyone
 * who enters it gets the same grid, and it encodes the difficulty.
 *
 * Signed-in players' results are settled on the server (start_game /
 * finish_game, read back with get_clash and my_clashes). A result also
 * travels in the share link, so a friend sees the time to beat at once, e.g.
 *   …/elomental/#clash=K7P2QX.6z.1.0.1   (code . seconds(base36) . mistakes . hints . solved)
 * A result that came only in a link could have been edited by hand.
 */

/** No 0/O, 1/I/L: codes are typed from a friend's message. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** Each hint and mistake adds this much to the time used to pick the winner. */
export const HINT_PENALTY_S = 30;
export const MISTAKE_PENALTY_S = 15;

export interface ClashResult {
  solved: boolean;
  /** Solve time in whole seconds. */
  seconds: number;
  mistakes: number;
  hints: number;
}

export interface ClashRecord {
  difficulty: Difficulty;
  mine?: ClashResult;
  theirs?: ClashResult;
  /** Last change (ms), for ordering the log. */
  updated?: number;
}

const STORE_KEY = 'elomental:clashes';

export const normalizeCode = (text: string): string =>
  text
    .toUpperCase()
    .split('')
    .filter((ch) => CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, CODE_LENGTH);

export const isValidCode = (code: string): boolean => code.length === CODE_LENGTH && normalizeCode(code) === code;

/** The difficulty is carried by the first character. */
export const difficultyOf = (code: string): Difficulty => DIFFICULTIES[CODE_ALPHABET.indexOf(code[0]) % 3];

export const seedOf = (code: string): string => `clash:${code}`;

export function newCode(difficulty: Difficulty): string {
  const want = DIFFICULTIES.indexOf(difficulty);
  const pick = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
    return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  };
  let code = pick();
  while (CODE_ALPHABET.indexOf(code[0]) % 3 !== want) code = pick();
  return code;
}

// --- Results in links ---------------------------------------------------------

export function encodeResult(r: ClashResult): string {
  return [r.seconds.toString(36), r.mistakes, r.hints, r.solved ? 1 : 0].join('.');
}

export function decodeResult(token: string): ClashResult | null {
  const [s, m, h, w] = token.split('.');
  const seconds = parseInt(s, 36);
  const mistakes = Number(m);
  const hints = Number(h);
  if (![seconds, mistakes, hints].every((n) => Number.isInteger(n) && n >= 0) || (w !== '0' && w !== '1')) return null;
  if (seconds > 24 * 3600 || mistakes > 3 || hints > 3) return null;
  return { seconds, mistakes, hints, solved: w === '1' };
}

export function shareLink(code: string, result?: ClashResult): string {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#clash=${code}${result ? `.${encodeResult(result)}` : ''}`;
}

/** Reads `#clash=CODE[.result]` from the URL (once) and clears it. */
export function takeLinkFromUrl(): { code: string; theirs: ClashResult | null } | null {
  const match = location.hash.match(/^#clash=([A-Za-z0-9]{6})(?:\.(.+))?$/);
  if (!match) return null;
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  const code = normalizeCode(match[1]);
  if (!isValidCode(code)) return null;
  return { code, theirs: match[2] ? decodeResult(match[2]) : null };
}

// --- Local record of clashes ----------------------------------------------------

const loadAll = (): Record<string, ClashRecord> => readJson<Record<string, ClashRecord>>(STORE_KEY) ?? {};

export function getClash(code: string): ClashRecord {
  return loadAll()[code] ?? { difficulty: difficultyOf(code) };
}

export function saveClash(code: string, update: Partial<ClashRecord>): ClashRecord {
  const all = loadAll();
  const next = { ...getClash(code), ...update, updated: update.updated ?? Date.now() };
  all[code] = next;
  writeJson(STORE_KEY, all);
  return next;
}

/** Every clash this device knows about, newest first. */
export function listClashes(): { code: string; record: ClashRecord }[] {
  return Object.entries(loadAll())
    .map(([code, record]) => ({ code, record }))
    .sort((a, b) => (b.record.updated ?? 0) - (a.record.updated ?? 0));
}

export type ClashStatus = 'won' | 'lost' | 'draw' | 'waiting' | 'unplayed';

/** Where a clash stands from this device's side. */
export function statusOf(record: ClashRecord): ClashStatus {
  if (!record.mine) return 'unplayed';
  if (!record.theirs) return 'waiting';
  const result = compare(record.mine, record.theirs);
  return result > 0 ? 'won' : result < 0 ? 'lost' : 'draw';
}

// --- Deciding the winner ----------------------------------------------------------

export const adjustedSeconds = (r: ClashResult): number =>
  r.seconds + r.hints * HINT_PENALTY_S + r.mistakes * MISTAKE_PENALTY_S;

/** 1 = I win, -1 = they win, 0 = draw. A solve beats a non-solve; then the lower adjusted time. */
export function compare(mine: ClashResult, theirs: ClashResult): -1 | 0 | 1 {
  if (mine.solved !== theirs.solved) return mine.solved ? 1 : -1;
  if (!mine.solved) return 0;
  const diff = adjustedSeconds(theirs) - adjustedSeconds(mine);
  return diff > 0 ? 1 : diff < 0 ? -1 : 0;
}


export async function share(code: string, result?: ClashResult): Promise<'shared' | 'copied' | 'failed'> {
  const url = shareLink(code, result);
  const text = result
    ? result.solved
      ? `Clash me on Elomental! Code ${code}. Beat my ${formatSeconds(result.seconds)} (${result.mistakes} mistakes, ${result.hints} hints).`
      : `Clash me on Elomental! Code ${code}. I didn't crack it. Can you?`
    : `Clash me on Elomental! Code ${code}.`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Elomental Clash', text, url });
      return 'shared';
    }
  } catch (error) {
    if ((error as DOMException)?.name === 'AbortError') return 'failed';
  }
  return (await copyText(`${text} ${url}`)) ? 'copied' : 'failed';
}
