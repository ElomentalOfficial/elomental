/**
 * Ranked stages: what each one deals, how fast, and how often it falls back to the stage below.
 *
 *   node scripts/benchmark-stages.ts --count 20
 *   node scripts/benchmark-stages.ts --stages 8,11 --count 50
 */
import { parseArgs } from 'node:util';
import { RANKED_STAGES, generatePuzzle } from '../src/index.ts';

const { values } = parseArgs({
  options: {
    stages: { type: 'string', short: 't', default: RANKED_STAGES.map((_, i) => i).join(',') },
    count: { type: 'string', short: 'n', default: '20' },
    seed: { type: 'string', short: 's', default: 'bench' },
  },
});

const count = Number(values.count);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const percentile = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))];

console.log('stage  clues min/avg/max  rating avg  ms avg/p90/max     attempts avg/max  hardest');
for (const stage of values.stages.split(',').map(Number)) {
  const clues: number[] = [];
  const ratings: number[] = [];
  const ms: number[] = [];
  const attempts: number[] = [];
  const hardest: Record<string, number> = {};
  let fellBack = 0;
  for (let i = 0; i < count; i++) {
    const started = performance.now();
    const p = generatePuzzle({ difficulty: 'medium', rankedStage: stage, seed: `${values.seed}:${stage}:${i}` });
    ms.push(performance.now() - started);
    clues.push(p.clues);
    ratings.push(p.rating);
    attempts.push(p.attempts);
    if (p.stage !== stage) fellBack++;
    hardest[p.hardest ?? 'none'] = (hardest[p.hardest ?? 'none'] ?? 0) + 1;
  }
  console.log(
    [
      RANKED_STAGES[stage].id.padEnd(6),
      `${Math.min(...clues)}/${avg(clues).toFixed(1)}/${Math.max(...clues)}`.padEnd(18),
      avg(ratings).toFixed(0).padEnd(11),
      `${avg(ms).toFixed(0)}/${percentile(ms, 0.9).toFixed(0)}/${Math.max(...ms).toFixed(0)}`.padEnd(18),
      `${avg(attempts).toFixed(1)}/${Math.max(...attempts)}`.padEnd(17),
      `fell back ${fellBack}`.padEnd(12),
      Object.entries(hardest)
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `${id} ${n}`)
        .join(', '),
    ].join(' '),
  );
}
