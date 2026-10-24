/**
 * Days for the Daily Square, pure date arithmetic (no storage, no UI), so it can be tested on its
 * own (test/streak.test.ts). profile.ts re-exports it.
 */

/** "2026-10-24" for a year, a month counted from 0, and a day. */
export const dateKey = (year: number, month: number, day: number): string =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** The daily square rolls over at 3 AM local time. */
export function dailyKey(now = new Date()): string {
  const shifted = new Date(now.getTime() - 3 * 3_600_000);
  return dateKey(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());
}

/** How long until the next daily square, in ms. */
export function nextResetIn(now = new Date()): number {
  const reset = new Date(now);
  reset.setHours(3, 0, 0, 0);
  if (reset.getTime() <= now.getTime()) reset.setDate(reset.getDate() + 1);
  return reset.getTime() - now.getTime();
}

/**
 * The Daily streak (owner, 2026-10-24): days in a row with the Daily solved or filled in (both are
 * in `daily`), counted back from today. Today not solved yet keeps yesterday's run alive until the
 * day turns.
 */
export function dailyStreak(daily: Record<string, true>, today = dailyKey()): number {
  const [year, month, day] = today.split('-').map(Number);
  const at = new Date(year, month - 1, day);
  if (!daily[today]) at.setDate(at.getDate() - 1);
  let run = 0;
  while (daily[dateKey(at.getFullYear(), at.getMonth(), at.getDate())]) {
    run++;
    at.setDate(at.getDate() - 1);
  }
  return run;
}
