// Parts: a part every 3rd solve with its guarantees, the daily limit, losses.
import { db, check, newPlayer, play, one, day, players } from './harness.mjs';

export default async function () {
  // --- 1. a part every 3rd solve, rarities, guarantees (spread over days so the limit doesn't bite)
  const a = await newPlayer();
  const tally = { common: 0, rare: 0, epic: 0, mythic: 0 };
  let solves = 0, drops = 0, dupes = 0, gapEpic = 0, maxGapEpic = 0, gapMythic = 0, maxGapMythic = 0, progressOk = true;
  for (let i = 0; i < 900; i++) {
    if (i % 9 === 0) await db.exec(`update public.games set finished_at = finished_at - interval '1 day' where user_id = '${a}'`);
    const j = await play(a, 'ranked', 'medium', { rating: 500 });
    solves++;
    if (!j.progress || j.progress.count !== solves % 3) progressOk = false;
    const d = j.drop;
    if ((solves % 3 === 0) !== !!d) progressOk = false;
    if (!d) continue;
    drops++; tally[d.rarity]++;
    if (d.duplicate) dupes++;
    gapEpic = d.rarity === 'epic' || d.rarity === 'mythic' ? 0 : gapEpic + 1; maxGapEpic = Math.max(maxGapEpic, gapEpic);
    gapMythic = d.rarity === 'mythic' ? 0 : gapMythic + 1; maxGapMythic = Math.max(maxGapMythic, gapMythic);
  }
  console.log(`\n900 rated solves -> ${drops} parts:`, Object.entries(tally).map(([k, v]) => `${k} ${(v / drops * 100).toFixed(1)}%`).join(', '), `duplicates ${dupes}`);
  check(drops === 300 && progressOk, 'exactly every 3rd solve drops a part, and the counter matches');
  check(maxGapEpic <= 9, `Epic or better within 10 parts (longest wait ${maxGapEpic})`);
  check(maxGapMythic <= 24, `Mythic within 25 parts (longest wait ${maxGapMythic})`);
  const owned = (await db.query(`select count(*)::int n from public.player_parts where player_id = $1`, [a])).rows[0].n;
  check(owned === 27, `300 parts collect the whole 27-part set (${owned})`);
  const dupDust = (await db.query(`select coalesce(sum(stardust),0)::int s from public.drops where player_id = $1 and duplicate`, [a])).rows[0].s;
  check(dupDust > 0, `duplicates paid Stardust (${dupDust})`);

  // --- 2. the daily limit: counting stops after 9 solves (3 parts)
  const b = await newPlayer();
  let partsToday = 0, lastProgress = null;
  for (let i = 0; i < 40; i++) { const j = await play(b, 'casual', 'medium'); if (j.drop) partsToday++; if (j.progress) lastProgress = j.progress; else lastProgress = 'stopped'; }
  check(partsToday === 3 && lastProgress === 'stopped', `40 solves in one day: 3 parts, then counting stops (${partsToday})`);

  // --- 3. losses and unrated: nothing counts
  const c = await newPlayer();
  const lost = await play(c, 'ranked', 'medium', { won: false });
  check(lost.drop === null && lost.progress === null, 'a loss counts for nothing');
  Object.assign(players, { a });
}
