// Affinity: choosing a side, influence, standings, switching once a month (faction_switch).
import { db, as, check, newPlayer, play, one, tryq } from './harness.mjs';

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

  // --- switching (faction_switch): once a month, within your first 5 days in your faction
  await as(d0);
  check(!!(await one(`select public.affinity_switch_open() t`)).t, 'just joined: switching is open');
  const sw = (await db.query(`select public.choose_affinity('fire') as j`)).rows[0].j;
  check(sw.affinity === 'fire', 'one switch within the 5 days');
  check(!!(await tryq(`select public.choose_affinity('earth')`)).err?.includes('affinity_locked'), 'a second switch the same month is refused');
  check(!(await one(`select public.affinity_switch_open() t`)).t, 'and the app is told it is closed');
  // the rule at fixed dates (UTC): joined 10 March, switched in March
  await db.query(`update public.profiles set affinity_since = '2027-03-10 12:00+00', affinity_switched_month = null where id = $1`, [d0]);
  const t1 = await one(`select private.affinity_switch_until(p, '2027-03-12 00:00+00') t from public.profiles p where id = $1`, [d0]);
  check(new Date(t1.t).toISOString() === '2027-03-15T12:00:00.000Z', `joined on the 10th: open 5 days, until the 15th (${t1.t})`);
  await db.query(`update public.profiles set affinity_since = '2027-02-20 12:00+00' where id = $1`, [d0]);
  const t2 = await one(`select private.affinity_switch_until(p, '2027-03-02 00:00+00') t from public.profiles p where id = $1`, [d0]);
  check(new Date(t2.t).toISOString() === '2027-03-06T00:00:00.000Z', `a new month opens it again: from the 1st, 5 days (${t2.t})`);
  await db.query(`update public.profiles set affinity_switched_month = '2027-03-01' where id = $1`, [d0]);
  const t3 = await one(`select private.affinity_switch_until(p, '2027-03-02 00:00+00') t from public.profiles p where id = $1`, [d0]);
  const t4 = await one(`select private.affinity_switch_until(p, '2027-04-02 00:00+00') t from public.profiles p where id = $1`, [d0]);
  check(t3.t === null && !!t4.t, 'switched in March: closed for March, open again in April');
}
