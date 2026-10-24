import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyStreak } from '../src/days.ts';

const days = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, true as const]));

test('the Daily streak counts days in a row back from today', () => {
  assert.equal(dailyStreak({}, '2026-10-24'), 0);
  assert.equal(dailyStreak(days('2026-10-24'), '2026-10-24'), 1);
  assert.equal(dailyStreak(days('2026-10-22', '2026-10-23', '2026-10-24'), '2026-10-24'), 3);
  // a gap ends it
  assert.equal(dailyStreak(days('2026-10-21', '2026-10-23', '2026-10-24'), '2026-10-24'), 2);
});

test('today not solved yet keeps yesterday’s streak alive; two days missed end it', () => {
  assert.equal(dailyStreak(days('2026-10-22', '2026-10-23'), '2026-10-24'), 2);
  assert.equal(dailyStreak(days('2026-10-21', '2026-10-22'), '2026-10-24'), 0);
});

test('the streak runs across months and years', () => {
  assert.equal(dailyStreak(days('2026-09-30', '2026-10-01'), '2026-10-01'), 2);
  assert.equal(dailyStreak(days('2025-12-31', '2026-01-01'), '2026-01-01'), 2);
});
