import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PLATE_LEVELS, platesAt, solveXp, xpLevel, xpTotal } from '../src/xp.ts';

test('the level curve: min(20 x L, 2000) XP from level L to L+1, no top level', () => {
  const at = (t: number) => { const l = xpLevel(t); return [l.level, l.into, l.need]; };
  assert.deepEqual(at(0), [1, 0, 20]);
  assert.deepEqual(at(19), [1, 19, 20]);
  assert.deepEqual(at(20), [2, 0, 40]);
  assert.deepEqual(at(60), [3, 0, 60]);
  // level 99 starts at 97,020; level 100 at 99,000; then 2,000 a level
  assert.deepEqual(at(98_999), [99, 1979, 1980]);
  assert.deepEqual(at(99_000), [100, 0, 2000]);
  assert.deepEqual(at(899_000), [500, 0, 2000]);
  for (let l = 1; l < 700; l++) assert.equal(xpLevel(xpTotal(l)).level, l);
});

test('plates come at levels 5, 10 … 100, nine of them for now', () => {
  assert.equal(PLATE_LEVELS.length, 9);
  assert.deepEqual([1, 4, 5, 14, 15, 34, 35, 99, 100, 5000].map(platesAt), [0, 0, 1, 2, 3, 4, 5, 8, 9, 9]);
});

test('XP and plates match the server (migrations account_level, level_plates)', () => {
  assert.deepEqual(
    [solveXp('casual', 'easy'), solveXp('casual', 'medium'), solveXp('casual', 'hard'), solveXp('clash', 'medium'), solveXp('daily', 'medium'), solveXp('ranked', 'medium')],
    [10, 20, 30, 20, 30, 40],
  );
  const dir = new URL('../../../supabase/migrations/', import.meta.url);
  const read = (end: string) => readFileSync(new URL(readdirSync(dir).find((f) => f.endsWith(end))!, dir), 'utf8');
  const level = read('_account_level.sql');
  assert.match(level, /when 'daily' then 30 when 'ranked' then 40/);
  assert.match(level, /when 'easy' then 10 when 'medium' then 20 else 30/);
  const plates = read('_level_plates.sql');
  assert.match(plates, /when l <= 100 then 10 \* l \* \(l - 1\) else 99000 \+ 2000 \* \(l - 100\)/);
  assert.match(plates, /need := least\(20 \* level, 2000\);/);
  assert.ok(plates.includes(`array[${PLATE_LEVELS.join(', ')}]`), 'the same plate levels');
});
