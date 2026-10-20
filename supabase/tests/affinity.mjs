// Affinity: choosing a side, influence, standings.
import { db, as, check, newPlayer, play } from './harness.mjs';

export default async function () {
  // --- 4. affinity: too soon, choose, influence
  const d0 = await newPlayer();
  await as(d0);
  let err = null;
  try { await db.query(`select public.choose_affinity('fire')`); } catch (e) { err = e.message; }
  check(err?.includes('too_soon'), 'affinity needs 3 solved squares first');
  for (let i = 0; i < 3; i++) await play(d0, 'casual', 'hard');
  await as(d0);
  const ch = (await db.query(`select public.choose_affinity('water') as j`)).rows[0].j;
  check(ch.affinity === 'water' && !('crest' in ch), 'choosing sets the affinity (no crest part any more)');
  const inf = await play(d0, 'daily', 'medium', { date: '2026-10-20' });
  check(inf.influence?.affinity === 'water' && inf.influence.amount === 5, `daily clean solve: +5 influence (${JSON.stringify(inf.influence)})`);
  await as(d0);
  let st = (await db.query(`select * from public.affinity_standings() order by affinity`)).rows;
  check(st.find((r) => r.affinity === 'water').members === 0, 'one solve: not yet a counted member');
  for (let i = 0; i < 4; i++) await play(d0, 'casual', 'easy');
  await as(d0);
  st = (await db.query(`select * from public.affinity_standings() order by affinity`)).rows;
  check(st.find((r) => r.affinity === 'water').members === 1, 'from 5 solves in the month the member counts');
}
