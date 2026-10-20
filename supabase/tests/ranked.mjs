// Ranked length (B10, D5) and Ranked integrity (B11).
import { db, as, check, newPlayer, play, setAudit, SOLVED, one } from './harness.mjs';

export default async function () {
  let err = null;
  // --- 16. Ranked length (batch B10, decision D5): short squares at every level
  const targets = (await one(`select json_agg(private.ranked_target(e) order by e) j from unnest(array[100, 1190, 1200, 2000, 3000, 4800]) e`)).j;
  check(JSON.stringify(targets) === JSON.stringify([150, 1190, 1200, 1466, 1800, 1800]), `D5 the square follows Elo to 1200, then a third as fast, to 1800 at 3000 (${targets})`);
  const pars = (await one(`select json_agg(private.par_seconds(r) order by r) j from unnest(array[150, 400, 600, 1800]) r`)).j;
  check(JSON.stringify(pars) === JSON.stringify([600, 600, 780, 900]), `D5 par is 10 to 15 minutes (${pars})`);
  const hi = await newPlayer();
  await db.exec(`update public.profiles set elo = 2000, ranked_games = 50, affinity = 'earth' where id = '${hi}'`);
  const hiWin = await play(hi, 'ranked', 'hard', { rating: 1466 });
  const even = (await one(`select private.elo_delta(2000, 2000, true, 50) d`)).d;
  // (play() starts the game 1200 s back: 1.33x the 900 s par, so no speed bonus)
  check(hiWin.elo.bonus === 0 && hiWin.elo.after - hiWin.elo.before === even, `D5 a win is priced as an even match against your own Elo, not the square's 1466 (+${hiWin.elo.after - hiWin.elo.before}, even +${even})`);
  check(hiWin.influence?.amount === 3 + 2 + 1, `D5 Ranked influence goes by your Elo (${JSON.stringify(hiWin.influence)})`);
  // C2 wins: a square far easier than its target is discounted, a harder one earns no premium
  async function rankedAt(uid, target, audited) {
    const { rows } = await db.query(`insert into public.games (user_id, mode, difficulty, seed, rating, target_rating, started_at)
      values ($1, 'ranked', 'hard', 's', $2, $2, now() - interval '1200 seconds') returning id`, [uid, target]);
    await setAudit(rows[0].id, { copied: false, solution: SOLVED, rating: audited });
    await as(uid);
    return (await db.query(`select public.finish_game($1, true, 0, 0, 1200, $2, $3) j`, [rows[0].id, audited, SOLVED])).rows[0].j;
  }
  const c2p = await newPlayer();
  const gain = (j) => j.elo.after - j.elo.before;
  const at2000 = async (r) => { await db.exec(`update public.profiles set elo = 2000, ranked_games = 50 where id = '${c2p}'`); return rankedAt(c2p, 1466, r); };
  const fair = await at2000(1466), cheap = await at2000(100), dear = await at2000(1828);
  check(gain(cheap) < gain(fair) / 2, `C2 a square far easier than its target is discounted (+${gain(cheap)} vs +${gain(fair)})`);
  check(gain(dear) === gain(fair), `C2 a harder square earns no premium (+${gain(dear)} vs +${gain(fair)})`);
  // par goes by the target: at target 300 (par 600 s), 280 s is +25% whatever rating is claimed
  const lowP = await newPlayer();
  await db.exec(`update public.profiles set elo = 300, ranked_games = 50 where id = '${lowP}'`);
  const { rows: lowG } = await db.query(`insert into public.games (user_id, mode, difficulty, seed, rating, target_rating, started_at)
    values ($1, 'ranked', 'medium', 's', 300, 300, now() - interval '280 seconds') returning id`, [lowP]);
  await setAudit(lowG[0].id, { copied: false, solution: SOLVED, rating: 650 });
  await as(lowP);
  const lowJ = (await db.query(`select public.finish_game($1, true, 0, 0, 280, 650, $2) j`, [lowG[0].id, SOLVED])).rows[0].j;
  check(lowJ.elo.bonus === 0.25, `C2 par goes by the target, not the claimed rating (bonus ${lowJ.elo.bonus})`);

  await db.exec(`update public.profiles set elo = 4000 where id = '${hi}'`);
  const top = await play(hi, 'ranked', 'hard', { rating: 1800 });
  check(top.elo.after - top.elo.before < even, `D5 above 3000 the gains fade (+${top.elo.after - top.elo.before})`);

  // --- 17. Ranked integrity (batch B11): one private audit per game, rate limits, the hand-off gone
  const ai = await newPlayer();
  const aiGame = (await one(`insert into public.games (user_id, mode, difficulty, seed, rating, target_rating, started_at) values ($1, 'ranked', 'medium', 's', 500, 500, now() - interval '1200 seconds') returning id`, [ai])).id;
  const casualGame = (await one(`insert into public.games (user_id, mode, difficulty, seed, rating) values ($1, 'casual', 'easy', 's', 100) returning id`, [ai])).id;
  await db.exec(`set role service_role`);
  await db.query(`select public.save_audit($1, $2)`, [aiGame, JSON.stringify({ copied: false, solution: SOLVED, rating: 500 })]);
  err = null; try { await db.query(`select public.save_audit($1, $2)`, [aiGame, JSON.stringify({ copied: false })]); } catch (e) { err = e.message; }
  check(err?.includes('already_audited'), 'C3 one audit per game: a second is refused');
  err = null; try { await db.query(`select public.save_audit($1, $2)`, [casualGame, '{}']); } catch (e) { err = e.message; }
  check(err?.includes('not_open'), 'C3 only an open Ranked game takes an audit');
  await db.exec(`reset role`);
  await db.exec(`set role authenticated`);
  err = null; try { await db.query(`select * from private.game_audits`); } catch (e) { err = e.message; }
  check(!!err, 'C3 a player can\'t read the audits (no oracle)');
  err = null; try { await db.query(`select public.save_audit($1, '{}')`, [aiGame]); } catch (e) { err = e.message; }
  check(err?.includes('permission denied'), 'C3 a player can\'t save an audit');
  await db.exec(`reset role`);
  await as(ai);
  const aiWin = (await one(`select public.finish_game($1, true, 0, 0, 1200, 500, $2) j`, [aiGame, SOLVED])).j;
  check(aiWin.elo?.unrated === null, `C3 finish_game reads the private audit (${JSON.stringify(aiWin.elo)})`);
  // the server's clock: a rated win needs a fifth of par (target 500: par 690 s, so 138 s)
  const tooQuick = await newPlayer();
  const quickGame = (await one(`insert into public.games (user_id, mode, difficulty, seed, rating, target_rating, started_at) values ($1, 'ranked', 'medium', 's', 500, 500, now() - interval '100 seconds') returning id`, [tooQuick])).id;
  await setAudit(quickGame, { copied: false, solution: SOLVED, rating: 500 });
  await as(tooQuick);
  const quickWin = (await one(`select public.finish_game($1, true, 0, 0, 100, 500, $2) j`, [quickGame, SOLVED])).j;
  const quickFlag = (await one(`select reason from private.review_flags where game_id = $1`, [quickGame]))?.reason;
  check(quickWin.elo.unrated === 'too_quick' && quickWin.elo.after === quickWin.elo.before && quickFlag === 'too_quick',
    `C3 a Ranked win under a fifth of par on the server's clock is unrated and flagged (${quickWin.elo.unrated}, flag ${quickFlag})`);
  // audit_slot: asked before any work; a done game says no; 10 a minute
  await db.exec(`set role service_role`);
  const slotDone = (await one(`select public.audit_slot($1, $2) ok`, [aiGame, ai])).ok;
  let slots = 1;
  err = null;
  for (let i = 0; i < 12 && !err; i++) { try { await db.query(`select public.audit_slot($1, $2)`, [aiGame, ai]); slots++; } catch (e) { err = e.message; } }
  await db.exec(`reset role`);
  check(slotDone === false && slots === 10 && err?.includes('slow_down'), `C3 audit_slot: an audited game says no, 10 asks a minute (${slotDone}, ${slots}, ${err})`);
  const cols = (await one(`select count(*)::int n from information_schema.columns where table_schema = 'public' and table_name = 'games' and column_name = 'audit'`)).n;
  check(cols === 0, 'C3 games.audit is gone');

  const rl = await newPlayer();
  await as(rl);
  let starts = 0;
  err = null;
  for (let i = 0; i < 25 && !err; i++) {
    try { await db.query(`select public.start_game('casual', 'easy')`); starts++; } catch (e) { err = e.message; }
  }
  check(starts === 20 && err?.includes('slow_down'), `M1 20 game starts a minute, then "slow down" (${starts}, ${err})`);
  let squares = 0;
  err = null;
  for (let i = 0; i < 15 && !err; i++) {
    const givens = SOLVED.slice(0, 80 - i) + '0'.repeat(i + 1);
    try { await db.query(`select public.square_code($1, 'easy', 100)`, [givens]); squares++; } catch (e) { err = e.message; }
  }
  check(squares === 10 && err?.includes('slow_down'), `M1 10 new square codes a minute (${squares}, ${err})`);
  const known = (await one(`select givens from public.squares where created_by = $1 limit 1`, [rl])).givens;
  check(typeof (await one(`select public.square_code($1, 'easy', 100) c`, [known])).c === 'string', 'M1 an existing square\'s code is still returned when limited');
  const handoffs = (await one(`select count(*)::int n from information_schema.tables where table_name = 'signin_handoffs'`)).n;
  check(handoffs === 0, 'L2 the hand-off table is gone');
  const queue = await one(`select count(*)::int n from private.review_queue`);
  check(queue.n >= 0, 'the review queue still reads');
}
