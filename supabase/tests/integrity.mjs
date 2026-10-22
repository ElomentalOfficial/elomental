// The full review's integrity fixes (batch B1).
import { db, as, check, newPlayer, play, setAudit, SOLVED, one, tryq, lbPlayer, day, today, veteran, old, players } from './harness.mjs';

export default async function () {
  const { fo, ana, cata } = players;
  // --- 12. the full review's integrity fixes (docs/FULL_REVIEW.md, batch B1)

  // C2: a Ranked loss is priced at the stored target, whatever the client says the puzzle was
  const h1 = await newPlayer(), h2 = await newPlayer();
  await db.query(`update public.profiles set elo = 1600, ranked_games = 30 where id in ($1, $2)`, [h1, h2]);
  const lose = async (uid, rating) => {
    await as(uid);
    const g = (await one(`select public.start_game('ranked') j`)).j;
    return (await one(`select public.finish_game($1, false, 0, 0, null, $2, null) j`, [g.game_id, rating])).j.elo;
  };
  const l1 = await lose(h1, 1600), l2 = await lose(h2, 4000);
  check(l1.after - l1.before === l2.after - l2.before && l1.after < l1.before, `C2 a forged rating doesn't soften a Ranked loss (${l1.after - l1.before} vs ${l2.after - l2.before})`);

  // C1: one open Casual game and one open Clash game; Casual pays 1 after 20 solves a day
  const oc = await newPlayer();
  await as(oc);
  await db.query(`select public.start_game('casual', 'hard')`);
  await db.query(`select public.start_game('casual', 'easy')`);
  for (const code of ['ABCDEF', 'ABCDEG', 'ABCDEH', 'ABCDEJ']) {
    await db.query(`select public.start_game('clash', null, null, $1)`, [code]);
    await db.exec(`update public.games set started_at = started_at - interval '1 minute' where user_id = '${oc}'`);
  }
  const opens = (await db.query(`select mode, count(*)::int n from public.games where user_id = $1 and finished_at is null group by mode order by mode`, [oc])).rows;
  check(JSON.stringify(opens) === '[{"mode":"casual","n":1},{"mode":"clash","n":3}]', `C1 one open Casual game, at most 3 open Clash games (${JSON.stringify(opens)})`);
  const back = await tryq(`select public.start_game('clash', null, null, 'ABCDEF') j`);
  check(back.err?.includes('clash_played'), 'C1 the oldest clash, closed, counts as played');
  const kept = await tryq(`select public.start_game('clash', null, null, 'ABCDEG') j`);
  check(kept.ok?.[0]?.j?.resumed === true, 'C1 the newer clashes can still be resumed');
  const grinder = await newPlayer();
  const pays = [];
  let lastPay = null;
  for (let i = 0; i < 22; i++) { lastPay = await play(grinder, 'casual', 'medium'); pays.push(lastPay.dust); }
  check(pays[19] === 8 && pays[20] === 1 && pays[21] === 1 && lastPay.dustCapped === true, `C1 Casual pays in full for 20 solves a day, then 1, and says so (${pays.slice(18).join(', ')})`);

  // what the migration tidied (data from before it)
  const staleOpen = (await db.query(`select mode, count(*)::int n from public.games where user_id = $1 and finished_at is null group by mode order by mode`, [old.stale])).rows;
  check(JSON.stringify(staleOpen) === '[{"mode":"casual","n":1},{"mode":"clash","n":3}]', `migration: old open games closed down to 1 Casual and 3 Clash (${JSON.stringify(staleOpen)})`);
  const newestKept = (await one(`select seed from public.games where user_id = $1 and mode = 'casual' and finished_at is null`, [old.stale])).seed;
  check(newestKept === 'b', 'migration: the newest Casual game stays open');
  const devOld = await one(`select p.test_account, (select edition from public.player_parts where player_id = p.id and part_id = $2) as edition,
    (select count(*)::int from public.affinity_months where player_id = p.id) as months from public.profiles p where p.id = $1`, [old.dev, old.myth]);
  check(devOld.test_account === true && devOld.edition === null && devOld.months === 0, `migration: the dev account is a test account, without its edition or influence (${JSON.stringify(devOld)})`);
  const devLedgerOld = await one(`select reason, stardust from private.ledger where player_id = $1 and ref = 'review_integrity'`, [old.dev]);
  check(devLedgerOld?.reason === 'dev_adjust' && devLedgerOld.stardust === 999999, `migration: the unexplained balance gets one ledger row (${JSON.stringify(devLedgerOld)})`);
  // (the accounts from before the migration: later sections set balances by hand)
  const sums = await one(`select count(*)::int n from public.profiles p
    where p.id in ($1, $2, $3) and (p.stardust <> coalesce((select sum(stardust) from private.ledger where player_id = p.id), 0)
       or p.spirits <> coalesce((select sum(spirits) from private.ledger where player_id = p.id), 0))`, [old.stale, old.dev, veteran]);
  check(sums.n === 0, `migration: every balance matches its ledger (${sums.n} don't)`);

  // the first leaderboard call is gone; no public function is open to signed-out visitors
  check(!!(await tryq(`select public.leaderboard(50)`)).err, 'the old leaderboard() call is gone');
  const anonFns = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`)).rows.map((r) => r.proname);
  check(anonFns.length === 0, `no public function runs for signed-out visitors (${anonFns.join(', ') || 'none'})`);

  // C4: in Ranked at most 2 minutes of pauses come off the counted time
  const pz = await newPlayer();
  const pg = (await one(`insert into public.games (user_id, mode, difficulty, seed, rating, started_at, paused_seconds)
    values ($1, 'ranked', 'medium', 's', 500, now() - interval '1200 seconds', 600) returning id`, [pz])).id;
  await setAudit(pg, { copied: false, solution: SOLVED, rating: 500 });
  await as(pz);
  const pj = (await one(`select public.finish_game($1, true, 0, 0, 10, 500, $2) j`, [pg, SOLVED])).j;
  check(Math.abs(pj.seconds - 1080) <= 2, `C4 Ranked time counts pauses beyond 2 minutes (${pj.seconds}s for 1200s with 600s paused)`);

  // M16: the 10th solve of a day says the parts are done for today
  const cap = await newPlayer();
  let last = null;
  for (let i = 0; i < 10; i++) last = await play(cap, 'casual', 'easy');
  check(last.partsCapped === true && last.progress === null, 'M16 finish_game says when the day\'s counted solves are used up');

  // H2: the founder's test account stays off every list, earns no influence and no edition
  await db.exec(`select private.refresh_lb()`);
  check((await one(`select count(*)::int n from private.lb where id = $1`, [fo])).n === 0, 'H2 a test account isn\'t on the leaderboard');
  await as(cata);
  check((await one(`select public.player_card($1) j`, [fo])).j.hidden === true, 'H2 a test account\'s card is private');
  check((await tryq(`select public.follow($1)`, [fo])).err?.includes('no_player'), 'H2 a test account can\'t be followed');
  await db.exec(`update public.profiles set affinity = 'fire' where id = '${fo}'`);
  const foSolve = await play(fo, 'casual', 'hard');
  check(!foSolve.influence, 'H2 a test account adds no influence');
  await as(fo);
  const myth = (await one(`select id, editions_forged from public.parts where rarity = 'mythic' limit 1`));
  await db.exec(`delete from public.player_parts where player_id = '${fo}' and part_id = '${myth.id}'`);
  const forged = (await one(`select public.forge_part($1) j`, [myth.id])).j;
  const mythAfter = (await one(`select editions_forged from public.parts where id = $1`, [myth.id])).editions_forged;
  check(forged.edition === null && mythAfter === myth.editions_forged, `H2 a test account's forge gets no numbered edition (${forged.edition}, counter ${myth.editions_forged} -> ${mythAfter})`);
  await db.exec(`select set_config('test.aal', 'aal1', false)`);

  // L1: hiding and restriction take effect at once, not at the next snapshot
  const vv = await lbPlayer('Veronica', 900), ww = await lbPlayer('Wilhelmina', 800);
  await db.exec(`select private.refresh_lb()`);
  await as(vv); await db.query(`select public.set_card_privacy(true, null)`);
  await as(ww);
  check(!(await one(`select public.lb_page('global') j`)).j.rows.some((r) => r.name === 'Veronica'), 'L1 a hidden player leaves the list straight away');
  await db.exec(`select private.restrict_ranked('Wilhelmina', 30)`);
  await as(cata);
  check(!(await one(`select public.lb_page('global') j`)).j.rows.some((r) => r.name === 'Wilhelmina'), 'L1 a restricted player leaves the list straight away');
  await db.exec(`delete from private.search_hits`);
  const wSearch = (await one(`select public.lb_search('wilhel') j`)).j;
  check(wSearch.length === 1 && wSearch[0].place === null, `L1 search shows a restricted player without a place (${JSON.stringify(wSearch.map((r) => r.place))})`);

  // L5: a player restricted mid-game gets no Elo for the open Ranked game; the flag queue is capped
  const rr = await lbPlayer('Rosalind', 1000);
  await as(rr);
  const rg = (await one(`select public.start_game('ranked') j`)).j;
  await db.exec(`select private.restrict_ranked('Rosalind', 30)`);
  await db.query(`update public.games set started_at = now() - interval '600 seconds' where id = $1`, [rg.game_id]);
  await setAudit(rg.game_id, { copied: false, solution: SOLVED, rating: 1000 });
  await as(rr);
  const re = (await one(`select public.finish_game($1, true, 0, 0, null, null, $2) j`, [rg.game_id, SOLVED])).j.elo;
  check(re.after === re.before && re.unrated === 'restricted', `L5 a restricted player's open Ranked win is unrated (${re.before} -> ${re.after}, ${re.unrated})`);
  const flooder = await newPlayer();
  for (let i = 0; i < 25; i++) await play(flooder, 'ranked', 'medium', { noAudit: true });
  const flags = (await one(`select count(*)::int n from private.review_flags where user_id = $1`, [flooder])).n;
  check(flags === 20, `L5 at most 20 open review flags per player (${flags})`);

  // L8: flagged Ranked wins don't use up the day's counted solves
  const fl = await newPlayer();
  for (let i = 0; i < 9; i++) await play(fl, 'ranked', 'medium', { noAudit: true });
  check((await play(fl, 'casual', 'easy')).progress !== null, 'L8 flagged wins don\'t use up the 9 counted solves');

  // L3: the Founder title needs a confirmed email
  await db.exec(`insert into private.founders (email) values ('later@example.test')`);
  const imp = (await one(`insert into auth.users (email) values ('later@example.test') returning id`)).id;
  check((await one(`select title from public.profiles where id = $1`, [imp])).title === null, 'L3 an unconfirmed sign-up gets no Founder title');
  await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [imp]);
  check((await one(`select title from public.profiles where id = $1`, [imp])).title === 'Founder', 'L3 confirming the email gives the title');

  // L10: a filled-in Daily can't also be played
  if (today > 1) {
    const md = await newPlayer();
    await db.exec(`update public.profiles set stardust = 300 where id = '${md}'`);
    await as(md);
    // (opened directly: start_game only opens yesterday's square before 15:00 UTC)
    const openDaily = { game_id: (await one(`insert into public.games (user_id, mode, difficulty, seed, rating, date_key)
      values ($1, 'daily', 'medium', 'daily:x', 400, $2) returning id`, [md, day(today - 1)])).id };
    await db.query(`select public.mend_daily($1)`, [day(today - 1)]);
    const replay = (await tryq(`select public.start_game('daily', null, $1)`, [day(today - 1)])).err ?? '';
    check(replay.includes('daily_done') || (new Date().getUTCHours() >= 15 && replay.includes('bad_date')), `L10 a mended day can't be played for a second reward (${replay.slice(0, 40)})`);
    const closed = (await one(`select finished_at is not null as f from public.games where id = $1`, [openDaily.game_id])).f;
    check(closed === true, 'L10 filling in a day closes its open game');
  } else console.log('  (skipped the mended Daily check: the 1st of the month)');

  // L16: no duplicate badges in the showcase (countries are gone: drop_country)
  await as(cata);
  check((await tryq(`select public.set_showcase(array['win-2026-09-fire', 'win-2026-09-fire'])`)).err?.includes('bad_request'), 'L16 the same badge can\'t fill two showcase places');
  check(!!(await tryq(`select public.set_country('GB')`)).err, 'no more countries: set_country is gone');
  check((await one(`select count(*)::int n from information_schema.columns where table_name = 'profiles' and column_name = 'country'`)).n === 0, 'no more countries: the column is gone');

  // L4: balances can't go below zero
  check(!!(await tryq(`update public.profiles set stardust = -1 where id = $1`, [cata])).err, 'L4 a negative balance is refused');

  // M4: influence counts up to 300 per member; a tie pays both sides; under 5 solves isn't paid
  const big = await lbPlayer('Bertrand', 1000);
  const few = await lbPlayer('Felicity', 1000);
  await db.exec(`insert into public.affinity_months (month, player_id, affinity, influence, solves) values
    ('2026-08-01', '${ana}', 'fire', 300, 30), ('2026-08-01', '${big}', 'water', 5000, 400),
    ('2026-08-01', '${few}', 'water', 40, 4)`);
  const s8 = (await db.query(`select * from private.standings('2026-08-01') order by affinity`)).rows;
  check(s8.find((r) => r.affinity === 'water').standing === s8.find((r) => r.affinity === 'fire').standing, `M4 one member's influence counts up to 300 (${s8.map((r) => `${r.affinity} ${r.standing}`).join(', ')})`);
  const earth8 = s8.find((r) => r.affinity === 'earth');
  check(earth8.members === 0 && Number(earth8.influence) === 0 && Number(earth8.standing) === 0, `M4 a side with nobody counted shows 0 influence (${JSON.stringify(earth8)})`);
  const fewBefore = (await one(`select stardust from public.profiles where id = $1`, [few])).stardust;
  await db.query(`select private.settle_faction_month('2026-08-01')`);
  const fm = await one(`select winners from public.faction_months where month = '2026-08-01'`);
  check(JSON.stringify(fm.winners) === '["fire","water"]', `M4 a tie: both sides win (${JSON.stringify(fm.winners)})`);
  const paidBig = (await one(`select count(*)::int n from public.player_badges where player_id = $1`, [big])).n;
  const fewAfter = (await one(`select stardust from public.profiles where id = $1`, [few])).stardust;
  check(paidBig === 1 && fewAfter === fewBefore, `M4 winners with 5+ solves are paid; under 5 isn't (${paidBig}, ${fewAfter - fewBefore})`);
}
