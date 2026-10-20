// Leaderboard paging with ties, and the season board (batch B8).
import { db, as, check, one, lbPlayer, players } from './harness.mjs';

export default async function () {
  // --- 14. leaderboard paging with ties, and the season board (docs/FULL_REVIEW.md, batch B8)
  await db.exec(`select set_config('test.aal', 'aal1', false)`);
  const tied = [];
  for (let i = 0; i < 120; i++) {
    const id = (await one(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [`tied${i}@example.test`])).id;
    await db.query(`update public.profiles set display_name = $2, elo = 100, ranked_games = 3 where id = $1`, [id, `Tied ${i}`]);
    tied.push(id);
  }
  await db.exec(`select private.refresh_lb()`);
  await as(tied[60]);
  const sizes = [];
  for (let p = 0; p < 10; p++) {
    const page = (await one(`select public.lb_page('global', $1) j`, [p])).j;
    sizes.push(page.rows.length);
    if (!page.rows.length) break;
  }
  const total = (await one(`select public.lb_page('global', 0) j`)).j.total;
  check(sizes.slice(0, Math.ceil(total / 50)).every((n, i, a) => n === (i < a.length - 1 ? 50 : total - 50 * (a.length - 1))) && sizes.reduce((a, b) => a + b, 0) === total,
    `M7 pages hold 50 rows each even with 120 players tied (${sizes.join('/')} of ${total})`);
  const aroundTied = (await one(`select public.lb_around_me('global') j`)).j;
  check(aroundTied.rows.length <= 21 && aroundTied.rows.some((r) => r.me) && aroundTied.rows.every((r) => r.place === aroundTied.place || r.elo !== 100),
    `M7 around me stays a window of 21 when tied, the place still shared (${aroundTied.rows.length} rows, place ${aroundTied.place})`);

  const seasonPlayer = async (name, n, best) => {
    const id = await lbPlayer(name, 1500);
    for (let i = 0; i < n; i++) {
      await db.query(`insert into public.games (user_id, mode, difficulty, seed, rating, finished_at, won, elo_before, elo_after)
        values ($1, 'ranked', 'medium', 's', 1500, now(), true, 1490, $2)`, [id, i === 0 ? best : 1400]);
    }
    return id;
  };
  const keen = await seasonPlayer('Keen', 20, 2100);
  const steady = await seasonPlayer('Steady', 25, 1900);
  await seasonPlayer('Fresh', 5, 2600);
  await db.exec(`select private.refresh_lb()`);
  await as(keen);
  const season = (await one(`select public.lb_page('season') j`)).j;
  // (other sections' players with 20+ Ranked games this season are on it too)
  const mine3 = season.rows.filter((r) => ['Keen', 'Steady', 'Fresh'].includes(r.name)).map((r) => `${r.name}:${r.value}`).join();
  check(mine3 === 'Keen:2100,Steady:1900', `M5 the season board ranks best Elo this season, from 20 Ranked games; 5 games aren't enough (${mine3})`);
  const seasonMe = (await one(`select public.lb_me('season') j`)).j;
  check(seasonMe.place === 1 && seasonMe.value === 2100 && seasonMe.seasonGames === 20, `M5 your season place and best (${JSON.stringify(seasonMe)})`);
  // the last of the tie (ties are broken by id), so its position is always past its place
  const lastTied = (await one(`select id from private.lb where elo = 100 order by id desc limit 1`)).id;
  const cardPos = (await one(`select public.player_card($1) j`, [lastTied])).j;
  check(cardPos.position > cardPos.place, `M7 the card gives the position for a tied place (place ${cardPos.place}, position ${cardPos.position})`);

  // a Ranked restriction starts the player's season again, and lifting it doesn't bring it back
  await db.query(`insert into private.ranked_restrictions (user_id, until, reason) values ($1, null, 'test')`, [steady]);
  await db.query(`delete from private.ranked_restrictions where user_id = $1`, [steady]);
  await db.exec(`select private.refresh_lb()`);
  const seasonAfter = (await one(`select public.lb_page('season') j`)).j.rows.filter((r) => ['Keen', 'Steady'].includes(r.name)).map((r) => r.name).join();
  check(seasonAfter === 'Keen', `M5 games before a restriction leave the season board (${seasonAfter})`);
  await as(steady);
  const steadyMe = (await one(`select public.lb_me('season') j`)).j;
  check(steadyMe.seasonGames === 0 && steadyMe.place === null, `M5 the restricted player's season starts again (${JSON.stringify(steadyMe)})`);
  await db.query(`insert into public.games (user_id, mode, difficulty, seed, rating, finished_at, won, elo_before, elo_after)
    values ($1, 'ranked', 'medium', 's', 1500, now() + interval '1 minute', true, 1490, 1500)`, [steady]);
  check((await one(`select public.lb_me('season') j`)).j.seasonGames === 1, 'M5 the season games count is live, before the next refresh');
}
