// The database tests: every migration replayed in PGlite (harness.mjs), then each area in turn,
// in one database. `npm run test:db`
import { fails } from './harness.mjs';

const AREAS = ['parts', 'affinity', 'forge', 'founder', 'leaderboard', 'integrity', 'daily', 'season', 'pace', 'ranked', 'ladder', 'level', 'security', 'cycles'];
for (const area of AREAS) {
  console.log(`\n== ${area}`);
  await (await import(`./${area}.mjs`)).default();
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall checks passed');
process.exit(fails.length ? 1 : 0);
