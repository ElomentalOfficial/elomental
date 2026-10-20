// The Ranked ladder (ranked_ladder): five ranks with a grace, squares by stage, the comeback
// square, the new Elo maths and the move onto the new scale.
import { RANKED_STAGES, rankedStage } from '../../packages/engine/src/generator.ts';
import { eloDelta, rankedOpponent } from '../../packages/web/src/elo.ts';
import { db, as, check, newPlayer, play, one, old, lbPlayer, tryq, SOLVED } from './harness.mjs';

export default async function () {
  // --- stages: the server and the engine agree on where each starts and the rating it stands for
  const stages = (await one(`select json_agg(json_build_object('at', private.ranked_stage(f), 'below', private.ranked_stage(f - 1),
      'rating', private.stage_rating(private.ranked_stage(f)::smallint)) order by f) j from unnest($1::int[]) f`,
    [RANKED_STAGES.map((s) => s.from)])).j;
  const mirrored = RANKED_STAGES.every((s, i) => stages[i].at === i && stages[i].below === Math.max(i - 1, 0) && stages[i].rating === s.rating);
  check(mirrored, `ranked_stage and stage_rating mirror the engine's RANKED_STAGES (${JSON.stringify(stages.map((s) => s.at))})`);
  check((await one(`select private.ranked_stage(9000) s`)).s === RANKED_STAGES.length - 1, 'past the last floor, the last stage');

  // --- ranks and the grace
  const floors = (await one(`select private.tier_floors() f`)).f;
  check(JSON.stringify(floors) === '[0,300,600,1000,1450]', `five rank floors: ${floors}`);
  const shown = async (prev, elo) => (await one(`select private.shown_tier($1::smallint, $2) t`, [prev, elo])).t;
  check(await shown(0, 299) === 0 && await shown(0, 300) === 1 && await shown(1, 1000) === 3, 'a rank is shown as soon as Elo reaches its floor');
  check(await shown(2, 551) === 2 && await shown(2, 549) === 1, 'a rank is kept until Elo is 50 below its floor');
  check(await shown(4, 1400) === 4 && await shown(4, 1399) === 3 && await shown(4, 900) === 2, 'the grace is 50 at every rank, and a big drop falls through');

  // --- Elo maths
  const d = async (elo, won) => (await one(`select private.elo_delta($1, private.ranked_opponent($1), $2, 0) d`, [elo, won])).d;
  check(await d(100, true) === 20 && await d(299, false) === 0, `a fresh account wins 20; no Elo lost in Novice (${await d(100, true)}, ${await d(299, false)})`);
  check(await d(300, false) === -14 && await d(500, false) === -25 && await d(500, true) === 17,
    `losses 0.75× the stake at 300, 1.5× from 500 (${await d(300, false)}, ${await d(500, false)} vs +${await d(500, true)})`);
  const w1600 = await d(1600, true), w1800 = await d(1800, true), l1800 = await d(1800, false);
  check(w1800 < w1600 / 2 && -l1800 > 10 * w1800, `above 1600 gains fade and losses grow (1600 +${w1600}; 1800 +${w1800} / ${l1800})`);

  // --- start_game deals the stage, and a comeback square after two losses
  const cb = await newPlayer();
  await db.exec(`update public.profiles set elo = 500, ranked_games = 10 where id = '${cb}'`);
  await as(cb);
  const start = async () => (await one(`select public.start_game('ranked') j`)).j;
  const lose = async (id) => (await one(`select public.finish_game($1, false, 3, 0, 600, null, null) j`, [id])).j;
  const s1 = await start();
  const g1 = await one(`select ranked_stage, target_rating from public.games where id = $1`, [s1.game_id]);
  check(s1.stage === 4 && !s1.comeback && g1.ranked_stage === 4 && g1.target_rating === 360, `start_game deals the Elo's stage and stores it (${JSON.stringify(s1)})`);
  const l1 = await lose(s1.game_id);
  const s2 = await start();
  const l2 = await lose(s2.game_id);
  const s3 = await start();
  check(!l1.elo.comeback && l2.elo.comeback && s3.comeback && s3.stage === rankedStage(l2.elo.after) - 1,
    `after two losses in a row the next square is a stage easier (${l2.elo.after} Elo, stage ${s3.stage}, ${s3.comeback})`);
  await db.exec(`update public.games set finished_at = now(), won = false where id = '${s3.game_id}'`);
  const won = await play(cb, 'ranked', 'medium', { rating: 360 });
  const s4 = await start();
  check(!won.elo.comeback && !s4.comeback && (await one(`select ranked_loss_run r from public.profiles where id = $1`, [cb])).r === 0,
    'a win ends the run: back to the Elo\'s own stage');
  await db.exec(`update public.games set finished_at = now(), won = false where id = '${s4.game_id}'`);
  const nv = await newPlayer();
  await db.exec(`update public.profiles set elo = 250, ranked_games = 3 where id = '${nv}'`);
  await as(nv);
  const n1 = await start();
  await lose(n1.game_id);
  const n2 = await start();
  const nl = await lose(n2.game_id);
  const n3 = await start();
  check(nl.elo.after === 250 && nl.elo.protectedLoss && !n3.comeback && n3.stage === 1, `Novice: losses are free, so no comeback square (${nl.elo.after}, stage ${n3.stage})`);
  await db.exec(`update public.games set finished_at = now(), won = false where id = '${n3.game_id}'`);

  // --- the rank moves with the grace, and the result says so
  const gr = await newPlayer();
  await db.exec(`update public.profiles set elo = 590, rank_tier = 1, ranked_games = 30, affinity = 'fire' where id = '${gr}'`);
  const up = await play(gr, 'ranked', 'medium', { rating: 420 });
  check(up.elo.after >= 600 && up.elo.tierBefore === 1 && up.elo.tier === 2, `promoted to Adept at 600 (${JSON.stringify(up.elo)})`);
  check(up.influence?.amount === 3 + 0 + 1, `Ranked influence by the rank held: Apprentice 3 (+1 clean) (${JSON.stringify(up.influence)})`);
  const tierNow = async () => (await one(`select rank_tier t, elo from public.profiles where id = $1`, [gr]));
  let t = await tierNow();
  while (t.elo >= 550) { await play(gr, 'ranked', 'medium', { rating: 420, won: false }); t = await tierNow(); if (t.elo >= 550) check(t.t === 2, `Adept kept at ${t.elo}`); }
  check(t.t === 1, `Adept lost only below 550 (${t.elo})`);
  await db.exec(`update public.profiles set rank_tier = 4, elo = 1500 where id = '${gr}'`);
  const topWin = await play(gr, 'ranked', 'hard', { rating: 1500 });
  check(topWin.influence?.amount === 3 + 3 + 1, `Elomental's Ranked influence is 6 (+1 clean) (${JSON.stringify(topWin.influence)})`);

  // --- the app and the server round alike (half up), at every Elo
  const serverWins = (await one(`select json_agg(private.elo_delta(e, private.ranked_opponent(e), true, 0) order by e) j from generate_series(0, 2600, 25) e`)).j;
  const appWins = Array.from({ length: 105 }, (_, i) => eloDelta(i * 25, rankedOpponent(i * 25), true));
  const differ = appWins.map((w, i) => (w === serverWins[i] ? null : `${i * 25}: app ${w}, server ${serverWins[i]}`)).filter(Boolean);
  check(differ.length === 0, `wins match the app's eloDelta from 0 to 2600 (${differ.join('; ') || 'all equal'})`);

  // --- an unchecked win keeps the comeback square: only a rated win ends the run
  const uc = await newPlayer();
  await db.exec(`update public.profiles set elo = 700, ranked_games = 20, ranked_loss_run = 2 where id = '${uc}'`);
  await play(uc, 'ranked', 'medium', { rating: 500, noAudit: true });
  check((await one(`select ranked_loss_run r from public.profiles where id = $1`, [uc])).r === 2, 'an unchecked win doesn\'t end the run of losses');

  // --- too quick: 1.2 s a cell on the singles stages, a fifth of par above them
  const quick = (await one(`select json_agg(private.quick_seconds(json_populate_record(null::public.games, json_build_object('ranked_stage', s)),
    private.stage_rating(s::smallint)) order by s) j from generate_series(0, 4) s`)).j;
  check(JSON.stringify(quick) === '[52,57,62,120,120]', `the too-quick floor: N1 52 s, N2 57, A1 62, then par / 5 (${quick})`);
  const fast = await newPlayer();
  await db.exec(`update public.profiles set elo = 100, ranked_games = 5 where id = '${fast}'`);
  const fastGame = (await one(`insert into public.games (user_id, mode, difficulty, seed, rating, target_rating, ranked_stage, started_at)
    values ($1, 'ranked', 'easy', 's', 150, 150, 0, now() - interval '90 seconds') returning id`, [fast])).id;
  await db.query(`insert into private.game_audits (game_id, audit) values ($1, $2)`, [fastGame, JSON.stringify({ copied: false, solution: SOLVED, rating: 150 })]);
  await as(fast);
  const fastWin = (await one(`select public.finish_game($1, true, 0, 0, 90, 150, $2) j`, [fastGame, SOLVED])).j;
  check(fastWin.elo.unrated === null && fastWin.elo.after > 100, `a 90 s Novice square is rated (${JSON.stringify(fastWin.elo)})`);

  // --- one open Ranked game per player
  const two = await newPlayer();
  await as(two);
  await one(`select public.start_game('ranked') j`);
  await one(`select public.start_game('ranked') j`);
  const open = (await one(`select count(*)::int n from public.games where user_id = $1 and mode = 'ranked' and finished_at is null`, [two])).n;
  const second = await tryq(`insert into public.games (user_id, mode, difficulty, seed, rating) values ($1, 'ranked', 'easy', 's', 150)`, [two]);
  check(open === 1 && !!second.err, `one open Ranked game: a new start closes the old, and a second open one is refused (${open}, ${second.err})`);
  await db.exec(`update public.games set finished_at = now(), won = false where user_id = '${two}' and finished_at is null`);

  // --- players can't move their own rank or run
  await db.exec(`set role authenticated`);
  const write = await tryq(`update public.profiles set rank_tier = 4, ranked_loss_run = 5 where id = auth.uid()`);
  await db.exec(`reset role`);
  check(!!write.err, 'a player can\'t write rank_tier or ranked_loss_run');

  // --- the move onto the new scale (players made just before the migration, harness.mjs)
  const want = { 100: [100, 0], 300: [280, 0], 600: [534, 1], 1200: [930, 2], 2000: [1330, 3], 3000: [1610, 4], 4800: [1700, 4] };
  let mapped = true;
  for (const { id, elo } of old.ladder) {
    const p = await one(`select elo, rank_tier from public.profiles where id = $1`, [id]);
    const g = await one(`select elo_after from public.games where user_id = $1 and mode = 'ranked'`, [id]);
    if (p.elo !== want[elo][0] || p.rank_tier !== want[elo][1] || g.elo_after !== want[elo][0]) {
      mapped = false;
      console.log('   ', elo, '→', p, g);
    }
  }
  check(mapped, 'old Elo and Ranked games re-expressed on the new scale, each in the same rank position');

  // --- the rank on the leaderboard and cards
  const lp = await lbPlayer('Ladderine', 1460, ', rank_tier = 4');
  await db.exec(`select private.refresh_lb()`);
  await as(lp);
  const page = (await one(`select public.lb_page('global') j`)).j;
  const row = page.rows.find((r) => r.id === lp);
  const card = (await one(`select public.player_card($1) j`, [lp])).j;
  const tiers = (await one(`select public.lb_tiers() j`)).j;
  check(row?.tier === 4 && card.tier === 4, `leaderboard rows and cards carry the rank shown (${row?.tier}, ${card.tier})`);
  check(tiers.tiers.map((x) => x.floor).join() === '0,300,600,1000,1450' && tiers.tiers.reduce((n, x) => n + Number(x.players), 0) === Number(tiers.total),
    `lb_tiers lists the five ranks and adds up (${tiers.tiers.map((x) => x.players).join('/')} of ${tiers.total})`);
}

