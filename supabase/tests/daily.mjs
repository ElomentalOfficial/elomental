// The Daily: its window and the month badge (batch B2).
import { db, as, check, newPlayer, play, one, tryq, ym, day, today } from './harness.mjs';

export default async function () {
  // --- 13. the Daily month badge and window (docs/FULL_REVIEW.md, batch B2)
  const iso = (d) => d.toISOString().slice(0, 10);
  const utcToday = new Date(Date.UTC(ym.getUTCFullYear(), ym.getUTCMonth(), ym.getUTCDate()));
  const shift = (n) => iso(new Date(utcToday.getTime() + n * 86400000));
  const hourNow = new Date().getUTCHours();
  const dw = await newPlayer();
  await as(dw);
  check(!!(await tryq(`select public.start_game('daily', null, $1)`, [shift(0)])).ok, 'B2 today\'s Daily opens');
  const yest = await tryq(`select public.start_game('daily', null, $1)`, [shift(-1)]);
  check(hourNow < 15 ? !!yest.ok : yest.err?.includes('bad_date'), `B2 yesterday's Daily only before 15:00 UTC (hour ${hourNow}: ${yest.err ?? 'opened'})`);
  const tmrw = await tryq(`select public.start_game('daily', null, $1)`, [shift(1)]);
  check(hourNow >= 13 ? !!tmrw.ok : tmrw.err?.includes('bad_date'), `B2 tomorrow's Daily only from 13:00 UTC (hour ${hourNow}: ${tmrw.err ?? 'opened'})`);
  check((await tryq(`select public.start_game('daily', null, $1)`, [shift(-2)])).err?.includes('bad_date'), 'B2 two days ago is refused');

  const monthKey = day(1).slice(0, 7);
  const badge = `daily-${monthKey}`;
  const dm = await newPlayer();
  let lastDaily = null;
  for (let n = 2; n <= 20; n++) lastDaily = (await play(dm, 'daily', 'medium', { date: day(n) })).daily;
  check(lastDaily.done === 19 && lastDaily.need === 20 && !lastDaily.monthComplete && !lastDaily.badgeNew, `B2 19 days: not yet (${JSON.stringify(lastDaily)})`);
  if (today > 1) {
    await db.exec(`update public.profiles set stardust = 300 where id = '${dm}'`);
    await as(dm);
    const mendRes = (await one(`select public.mend_daily($1) j`, [day(1)])).j;
    check(mendRes.daily?.done === 20 && mendRes.daily.badgeNew === true && mendRes.daily.badge === badge, `B2 a fill-in can complete the month and earn the badge (${JSON.stringify(mendRes.daily)})`);
  } else {
    lastDaily = (await play(dm, 'daily', 'medium', { date: day(21) })).daily;
    check(lastDaily.badgeNew === true, 'B2 the 20th day earns the badge');
  }
  const again = (await play(dm, 'daily', 'medium', { date: day(22) })).daily;
  check(again.monthComplete === true && again.badgeNew === false, 'B2 the badge is earned once; later days say the month is done');
  const owns = (await one(`select count(*)::int n from public.player_badges where player_id = $1 and badge = $2`, [dm, badge])).n;
  check(owns === 1, `B2 the badge is on the player (${owns})`);
  const lostDaily = (await play(dm, 'daily', 'medium', { date: day(23), won: false })).daily;
  check(lostDaily.done === 21, 'B2 a lost Daily still reports the month');
}
