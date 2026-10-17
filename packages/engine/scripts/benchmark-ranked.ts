/**
 * How well Ranked generation hits its target rating, and how fast.
 *
 *   npm run benchmark -- --count 20
 *   npm run benchmark -- --targets 300,1000,2000 --count 50
 */
import { parseArgs } from 'node:util';
import { RATING_WINDOW, difficultyForRating, generatePuzzle } from '../src/index.ts';

const { values } = parseArgs({
  options: {
    targets: { type: 'string', short: 't', default: '300,600,1000,1500,2000' },
    count: { type: 'string', short: 'n', default: '20' },
    seed: { type: 'string', short: 's', default: 'bench' },
  },
});

const targets = values.targets.split(',').map(Number);
const count = Number(values.count);
const summary = (xs: number[], digits = 0) =>
  `${Math.min(...xs).toFixed(digits)} / ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(digits)} / ${Math.max(...xs).toFixed(digits)}`;
const percentile = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))];

console.log(`target  on-target  rating min/avg/max    |miss| avg  ms min/avg/p90/max     attempts avg  hardest`);
for (const target of targets) {
  const ratings: number[] = [];
  const ms: number[] = [];
  const attempts: number[] = [];
  const hardest: Record<string, number> = {};
  let hits = 0;
  for (let i = 0; i < count; i++) {
    const started = performance.now();
    const p = generatePuzzle({ difficulty: difficultyForRating(target), targetRating: target, seed: `${values.seed}:${target}:${i}` });
    ms.push(performance.now() - started);
    ratings.push(p.rating);
    attempts.push(p.attempts);
    if (Math.abs(p.rating - target) <= RATING_WINDOW) hits++;
    hardest[p.hardest ?? 'none'] = (hardest[p.hardest ?? 'none'] ?? 0) + 1;
  }
  const misses = ratings.map((r) => Math.abs(r - target));
  console.log(
    [
      String(target).padEnd(7),
      `${hits}/${count}`.padEnd(10),
      summary(ratings).padEnd(21),
      summary(misses).split(' / ')[1].padEnd(11),
      `${Math.min(...ms).toFixed(0)}/${summary(ms).split(' / ')[1]}/${percentile(ms, 0.9).toFixed(0)}/${Math.max(...ms).toFixed(0)}`.padEnd(22),
      (attempts.reduce((a, b) => a + b, 0) / count).toFixed(1).padEnd(13),
      Object.entries(hardest)
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `${id} ${n}`)
        .join(', '),
    ].join(' '),
  );
}
