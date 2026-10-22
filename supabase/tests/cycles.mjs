// Cycles (migration cycles, docs/WIPE_SYSTEM.md): month boundaries, leap years, the season close
// (snapshot, badge, soft reset, next season), dry run, crash and rerun safety, the month and the
// season on the same night, offline players, hold, rollback, and parts after a new season opens.
// Runs last: it closes Season Alpha.
import { db, as, check, newPlayer, one, tryq } from './harness.mjs';

const ts = async (sql, args = []) => new Date((await one(`select (${sql}) as t`, args)).t).toISOString();

export default async function () {
  // --- boundaries: always the 1st, 00:00 UTC, whatever the month's length
  const end = (start, months) => ts(`private.season_end_for($1::timestamptz, $2)`, [start, months]);
  check(await end('2027-07-01T00:00:00Z', 6) === '2028-01-01T00:00:00.000Z', 'season end: July + 6 = 1 January');
  check(await end('2027-08-01T00:00:00Z', 6) === '2028-02-01T00:00:00.000Z', 'season end: August + 6 = 1 February');
  check(await end('2028-02-29T10:00:00Z', 1) === '2028-03-01T00:00:00.000Z', 'leap year: a season postponed to 29 February still ends on 1 March');
  check(await end('2027-01-31T23:59:00Z', 1) === '2027-02-01T00:00:00.000Z', 'month length: from 31 January, one month ends on 1 February');
  check(await end('2027-03-01T00:00:00Z', 12) === '2028-03-01T00:00:00.000Z', 'twelve months: a year to the day');
  check(await end('2027-07-03T00:00:00Z', 6) === '2028-01-01T00:00:00.000Z', 'a season postponed to the 3rd still ends on a 1st');
  check(!!(await tryq(`update private.cycle_config set season_months = 13`)).err, 'config: a season can\'t be longer than 12 months');

  // --- the faction month: catch-up in order, across February in a leap year (Alpha moved past
  // 2028 for this part, so the runs below settle months only)
  await db.query(`select private.set_season_end(0::smallint, '2030-01-01')`);
  const fan = await newPlayer();
  await db.query(`update public.profiles set affinity = 'water', display_name = 'Faye' where id = $1`, [fan]);
  for (const m of ['2028-01-01', '2028-02-01']) {
    await db.query(`insert into public.affinity_months (month, player_id, affinity, influence, solves) values ($1, $2, 'water', 120, 6)`, [m, fan]);
  }
  const run1 = (await one(`select private.run_cycles('2028-03-01 00:05+00') as j`)).j;
  const settled = (await db.query(`select to_char(month, 'YYYY-MM') m from public.faction_months where month in ('2028-01-01', '2028-02-01') order by settled_at, month`)).rows.map((r) => r.m);
  check(settled.join() === '2028-01,2028-02', `a missed cron catches up, oldest month first (${settled.join()})`);
  check(run1.failed === 0, `nothing failed (${JSON.stringify(run1)})`);
  const winBadges = (await one(`select count(*)::int n from public.player_badges where player_id = $1 and badge like 'win-2028-0%'`, [fan])).n;
  check(winBadges === 2, `each month won pays its own badge (${winBadges})`);
  await db.query(`select private.run_cycles('2028-03-01 01:05+00')`);
  const again = (await one(`select count(*)::int n from public.player_badges where player_id = $1 and badge like 'win-2028-0%'`, [fan])).n;
  const dust = (await one(`select count(*)::int n from private.ledger where player_id = $1 and reason = 'faction_win' and ref like '2028-0%'`, [fan])).n;
  check(again === 2 && dust === 2, `rerun: no month paid twice (${again} badges, ${dust} payments)`);

  // --- the season: players
  const champ = await newPlayer();
  const casual = await newPlayer();
  const tester = await newPlayer();
  const away = await newPlayer();
  const fresh = await newPlayer();
  const idle = await newPlayer();
  await db.query(`update public.profiles set display_name = 'Idle', elo = 900, rank_tier = 2 where id = $1`, [idle]);
  await db.query(`update public.profiles set display_name = 'Champ', elo = 700, rank_tier = 2 where id = $1`, [champ]);
  await db.query(`update public.profiles set display_name = 'Casual', elo = 320, rank_tier = 1 where id = $1`, [casual]);
  await db.query(`update public.profiles set display_name = 'Tester', elo = 1500, rank_tier = 4, test_account = true where id = $1`, [tester]);
  await db.query(`update public.profiles set display_name = 'Away', elo = 640, rank_tier = 2, affinity = 'fire' where id = $1`, [away]);
  const games = async (uid, n, best) => {
    for (let i = 0; i < n; i++) {
      await db.query(`insert into public.games (user_id, mode, difficulty, seed, rating, started_at, finished_at, won, elo_before, elo_after)
        values ($1, 'ranked', 'hard', 's', 400, now() - interval '3 days', now() - interval '2 days', true, $2, $3)`, [uid, best - 10, i === n - 1 ? best : best - 20]);
    }
  };
  await games(champ, 22, 720);    // badge: Adept (600+)
  // one lucky win into Archmage: a peak, not a rank held
  await db.query(`insert into public.games (user_id, mode, difficulty, seed, rating, started_at, finished_at, won, elo_before, elo_after)
    values ($1, 'ranked', 'hard', 's', 400, now() - interval '3 days', now() - interval '2 days', true, 990, 1010)`, [champ]);
  await games(casual, 3, 330);    // too few games: no badge (a short test season asks for 4)
  await games(tester, 25, 1500);  // test account: no badge
  await games(away, 20, 650);     // offline from now on
  // the away player's side won a month too, settled while they're gone
  await db.query(`insert into public.affinity_months (month, player_id, affinity, influence, solves) values ('2025-03-01', $1, 'fire', 90, 7)`, [away]);

  // the season ends; the close hasn't run yet
  await db.query(`select private.set_season_end(0::smallint, now() - interval '1 hour')`);
  check((await one(`select private.current_season() s`)).s === 0, 'between the end and the close: still Season Alpha');

  // --- dry run: who gets what, nothing written
  const dry = (await one(`select private.close_season(0::smallint, now(), true) j`)).j;
  const champRow = dry.rows.find((r) => r.name === 'Champ');
  check(champRow?.badge === 'season-0-adept' && champRow.eloAfter === 340, `dry run: Champ gets Adept, 700 → 340 (${JSON.stringify(champRow)})`);
  check(dry.rows.find((r) => r.name === 'Tester')?.badge === null && dry.rows.find((r) => r.name === 'Casual')?.badge === null, 'dry run: no badge for a test account or under 20 games');
  const untouched = await one(`select (select elo from public.profiles where id = $1) elo, (select closed_at from public.seasons where id = 0) closed, (select count(*)::int from public.season_results) results`, [champ]);
  check(untouched.elo === 700 && untouched.closed === null && untouched.results === 0, 'dry run writes nothing');

  // --- crash mid-close: everything rolls back
  await db.exec('begin');
  await db.query(`select private.close_season(0::smallint, now(), false)`);
  await db.exec('rollback');   // as a crash would: the transaction never commits
  const afterCrash = await one(`select (select elo from public.profiles where id = $1) elo, (select closed_at from public.seasons where id = 0) closed,
    (select count(*)::int from public.player_badges where badge like 'season-0-%') badges, (select count(*)::int from public.seasons) seasons`, [champ]);
  check(afterCrash.elo === 700 && afterCrash.closed === null && afterCrash.badges === 0 && afterCrash.seasons === 1, `a crash mid-close leaves nothing half done (${JSON.stringify(afterCrash)})`);

  // --- the month and the season on the same night: month first
  const before = (await one(`select coalesce(max(id), 0)::int n from private.cycle_runs`)).n;
  const run2 = (await one(`select private.run_cycles(now()) j`)).j;
  const order = (await db.query(`select kind, ref from private.cycle_runs where id > $1 and status = 'done' order by id`, [before])).rows;
  check(run2.failed === 0 && order.at(-1)?.kind === 'season' && order.some((r) => r.kind === 'faction'), `month settled before the season closes (${order.map((r) => `${r.kind} ${r.ref}`).join(', ')})`);

  // --- the close itself
  const after = (uid) => one(`select elo, rank_tier, ranked_loss_run from public.profiles where id = $1`, [uid]);
  check((await after(champ)).elo === 340 && (await after(champ)).rank_tier === 1, 'soft reset: 700 → 340 (40% of the Elo above 100 kept), rank from the new Elo');
  check((await after(tester)).elo === 660, 'no rank floor: Elomental 1500 → 660 (test accounts are reset too)');
  check((await after(idle)).elo === 900, 'a player who didn\'t play Ranked this season keeps their Elo (900)');
  check((await after(fresh)).elo === 100, 'a player who never played stays at 100');
  const champBadge = (await one(`select count(*)::int n from public.player_badges where player_id = $1 and badge = 'season-0-adept'`, [champ])).n;
  check(champBadge === 1, 'the season badge for the highest rank won 3 times: Adept, not one lucky Archmage win');
  const hist = await one(`select final_elo, elo_after, best_elo, best_tier, games, place, badge from public.season_results where season_id = 0 and player_id = $1`, [champ]);
  check(hist.final_elo === 700 && hist.elo_after === 340 && hist.best_elo === 1010 && hist.best_tier === 2 && hist.games === 23 && hist.place >= 1 && hist.badge === 'season-0-adept',
    `the season is kept in season_results (${JSON.stringify(hist)})`);
  const s1 = await one(`select id, starts_at, ends_at, closed_at from public.seasons where id = 1`);
  const s0 = await one(`select ends_at, closed_at from public.seasons where id = 0`);
  check(s1 && new Date(s1.starts_at).getTime() === new Date(s0.ends_at).getTime() && new Date(s1.ends_at).getUTCDate() === 1 && s0.closed_at,
    `Season 1 opens where Alpha ended and ends on a 1st (${s1?.ends_at})`);
  check((await one(`select private.current_season() s`)).s === 1, 'Season 1 is the current season');

  // --- rerun: nothing twice
  const badgesNow = (await one(`select count(*)::int n from public.player_badges where badge like 'season-0-%'`)).n;
  await db.query(`select private.run_cycles(now())`);
  const twice = await one(`select (select elo from public.profiles where id = $1) elo, (select count(*)::int from public.player_badges where badge like 'season-0-%') badges,
    (select count(*)::int from public.seasons) seasons`, [champ]);
  check(twice.elo === 340 && twice.badges === badgesNow && twice.seasons === 2, `rerun: no second reset, badge or season (${JSON.stringify(twice)})`);
  const again0 = (await one(`select private.close_season(0::smallint) j`)).j;
  check(again0.already === true, 'closing a closed season by hand just says so');

  // --- the offline player: reset and paid while away, told on return
  check((await after(away)).elo === 316, 'offline: reset with everyone who played (640 → 316)');
  await as(away);
  const news = (await one(`select public.cycle_news() j`)).j;
  check(news.seasons.length === 1 && news.seasons[0].badge === 'season-0-adept' && news.seasons[0].eloAfter === 316,
    `"While you were away": the season (${JSON.stringify(news.seasons)})`);
  check(news.months.some((m) => m.side === 'fire' && m.won === true), `"While you were away": the month their side won (${JSON.stringify(news.months)})`);
  await db.query(`select public.cycle_news_seen()`);
  const quiet = (await one(`select public.cycle_news() j`)).j;
  check(quiet.seasons.length === 0 && quiet.months.length === 0, 'once seen, the news is empty');
  const info = (await one(`select public.cycle_info() j`)).j;
  check(info.season?.id === 1 && new Date(info.month.endsAt).getUTCDate() === 1, `cycle_info: the season and this month's end (${JSON.stringify(info.season)})`);

  // --- parts after a season without its own set: the newest set stays on offer
  check((await one(`select private.parts_season() s`)).s === 0, 'Season 1 has no parts yet: Alpha\'s set stays on offer');
  const g = (await one(`insert into public.games (user_id, mode, difficulty, seed, rating, started_at, finished_at, won) values ($1, 'casual', 'easy', 's', 300, now(), now(), true) returning id`, [champ])).id;
  const drop = (await one(`select private.drop_part($1, $2) j`, [champ, g])).j;
  check(!!drop.part && drop.part.startsWith('s0-'), `drops still give a part (${drop.part})`);

  // --- hold: nothing runs while it's on
  await db.query(`select private.set_season_end(1::smallint, now() - interval '1 minute')`);
  await db.query(`update private.cycle_config set hold_until = now() + interval '2 days'`);
  const held = (await one(`select private.run_cycles() j`)).j;
  check(!!held.held && (await one(`select closed_at from public.seasons where id = 1`)).closed_at === null, 'hold: an ended season waits');
  await db.query(`update private.cycle_config set hold_until = null`);
  await db.query(`select private.set_season_end(1::smallint, now() + interval '30 days')`);

  // --- rollback: Elo back by the reset's amount, keeping a change since
  await db.query(`update public.profiles set elo = elo + 25 where id = $1`, [champ]);   // a win in Season 1
  await db.query(`update private.cycle_config set hold_until = now() + interval '1 day'`);
  // Season 1 must go first: reopening 0 removes 1, which is still open
  await db.query(`select private.reopen_season(0::smallint)`);
  const rolled = await one(`select (select elo from public.profiles where id = $1) elo, (select count(*)::int from public.player_badges where badge like 'season-0-%') badges,
    (select count(*)::int from public.seasons) seasons, (select closed_at from public.seasons where id = 0) closed`, [champ]);
  check(rolled.elo === 725 && rolled.badges === 0 && rolled.seasons === 1 && rolled.closed === null, `reopen: 365 → 725, badges and Season 1 gone (${JSON.stringify(rolled)})`);
  // close it again so the database ends as it would live
  await db.query(`update private.cycle_config set hold_until = null`);
  await db.query(`select private.run_cycles(now())`);
  check((await one(`select count(*)::int n from public.seasons where id = 1`)).n === 1, 'and it closes again cleanly');

  // --- who can call what
  await as(fresh);
  for (const f of ['private.run_cycles()', `private.close_season(0::smallint)`, `private.reopen_season(0::smallint)`]) {
    check(!(await one(`select has_function_privilege('authenticated', '${f.replace(/\(.*\)/, '')}(${f.includes('close') ? 'smallint,timestamptz,boolean' : f.includes('reopen') ? 'smallint' : 'timestamptz'})', 'execute') a`)).a, `players can't call ${f.split('(')[0]}`);
  }
  check(!(await one(`select has_function_privilege('anon', 'public.cycle_info()', 'execute') a`)).a, 'cycle_info is for signed-in players');
}
