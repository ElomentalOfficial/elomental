import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { solveXp, xpLevel } from '../src/xp.ts';

test('the level curve: 50 x L XP from level L to L+1, no top level', () => {
  const at = (t: number) => { const l = xpLevel(t); return [l.level, l.into, l.need]; };
  assert.deepEqual(at(0), [1, 0, 50]);
  assert.deepEqual(at(49), [1, 49, 50]);
  assert.deepEqual(at(50), [2, 0, 100]);
  assert.deepEqual(at(150), [3, 0, 150]);
  // level 98 starts at 25 x 98 x 97 = 237,650; level 99 at 242,550
  assert.deepEqual(at(242_549), [98, 4899, 4900]);
  assert.deepEqual(at(242_550), [99, 0, 4950]);
  // level 632 starts at 9,969,800
  assert.deepEqual(at(10_000_000), [632, 30_200, 31_600]);
  // every step costs exactly 50 x L
  for (let l = 1; l < 300; l++) assert.equal(xpLevel(25 * l * (l - 1)).level, l);
});

test('XP per win matches the server (migration account_level)', () => {
  assert.deepEqual(
    [solveXp('casual', 'easy'), solveXp('casual', 'medium'), solveXp('casual', 'hard'), solveXp('clash', 'medium'), solveXp('daily', 'medium'), solveXp('ranked', 'medium')],
    [10, 20, 30, 20, 30, 40],
  );
  const dir = new URL('../../../supabase/migrations/', import.meta.url);
  const sql = readFileSync(new URL(readdirSync(dir).find((f) => f.endsWith('_account_level.sql'))!, dir), 'utf8');
  assert.match(sql, /when 'daily' then 30 when 'ranked' then 40/);
  assert.match(sql, /when 'easy' then 10 when 'medium' then 20 else 30/);
  assert.match(sql, /need := 50 \* level;/);
});
