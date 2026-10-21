// Account level (account_level, level_plates): XP for every rated win, no daily cap; L to L+1 costs
// min(20 x L, 2000); a name plate at levels 5, 10 … 100 (nine for now), equipped on unlock when the newest was worn.
import { db, as, check, newPlayer, play, one, old, today, day } from './harness.mjs';

export default async function () {
  // one game after another, as a person plays: the player's earlier games finished 2 minutes ago
  // (the pace guard pays no XP for wins finished side by side)
  const paced = async (uid, ...args) => {
    await db.query(`update public.games set finished_at = finished_at - interval '2 minutes' where user_id = $1 and finished_at is not null`, [uid]);
    return play(uid, ...args);
  };
  // --- the curve: level L to L+1 costs min(20 x L, 2000); reaching L takes 10 x L x (L - 1) up to
  // level 100 (99,000), then 2,000 a level
  const lv = async (t) => one(`select level, into_level, need from private.xp_level($1)`, [t]);
  const at = await Promise.all([0, 19, 20, 59, 60, 98999, 99000, 101000, 899000].map(lv));
  check(JSON.stringify(at.map((r) => [r.level, r.into_level, r.need])) ===
    JSON.stringify([[1, 0, 20], [1, 19, 20], [2, 0, 40], [2, 39, 40], [3, 0, 60], [99, 1979, 1980], [100, 0, 2000], [101, 0, 2000], [500, 0, 2000]]),
    `the curve: min(20 x L, 2000) XP a level (${JSON.stringify(at)})`);
  const plates = (await one(`select json_agg(private.plates_at(l) order by o) j from unnest(array[1, 4, 5, 14, 15, 34, 35, 99, 100, 5000]) with ordinality u (l, o)`)).j;
  check(JSON.stringify(plates) === JSON.stringify([0, 0, 1, 2, 3, 4, 5, 8, 9, 9]), `9 plates, at levels 5, 10 … 100 (${plates})`);

  // --- XP by mode, on a win
  const x = await newPlayer();
  const easy = await paced(x, 'casual', 'easy');
  check(easy.xp?.gained === 10 && easy.xp.total === 10 && easy.xp.level === 1 && easy.xp.into === 10 && easy.xp.need === 20 && !easy.xp.levelUp,
    `an Easy win: 10 XP (${JSON.stringify(easy.xp)})`);
  const medium = await paced(x, 'casual', 'medium');
  const hard = await paced(x, 'casual', 'hard');
  check(medium.xp.gained === 20 && hard.xp.gained === 30, `Medium 20, Hard 30 (${medium.xp.gained}, ${hard.xp.gained})`);
  check(medium.xp.level === 2 && medium.xp.levelUp && hard.xp.total === 60 && hard.xp.level === 3 && hard.xp.levelUp, `30 XP reaches level 2, 60 level 3 (${JSON.stringify(hard.xp)})`);
  if (today > 1) {
    const daily = await paced(x, 'daily', 'medium', { date: day(1) });
    check(daily.xp?.gained === 30, `the Daily: 30 (${daily.xp?.gained})`);
  }
  const ranked = await paced(x, 'ranked', 'hard');
  check(ranked.xp?.gained === 40, `a rated Ranked win: 40 (${ranked.xp?.gained})`);

  // --- nothing for a loss or an unrated win; nothing taken away
  const before = (await one(`select xp from public.profiles where id = $1`, [x])).xp;
  const loss = await paced(x, 'casual', 'hard', { won: false });
  const unrated = await paced(x, 'ranked', 'hard', { noAudit: true });
  const after = (await one(`select xp from public.profiles where id = $1`, [x])).xp;
  check(loss.xp === null && unrated.xp?.gained === 0 && after === before, `no XP for a loss or an unrated win (${JSON.stringify(loss.xp)}, ${unrated.xp?.gained}, ${before} → ${after})`);

  // --- no daily cap: the 10th and later wins of the day still pay
  const grind = await newPlayer();
  let last = null;
  for (let i = 0; i < 12; i++) last = await paced(grind, 'casual', 'easy');
  check(last.xp.gained === 10 && last.xp.total === 120 && last.xp.level === 4, `12 Easy wins in a day: all 12 pay (${JSON.stringify(last.xp)})`);

  // --- the pace guard: two wins finished side by side pay once (a script, not a person)
  const bot = await newPlayer();
  const first = await play(bot, 'casual', 'hard');
  const second = await play(bot, 'casual', 'hard');
  check(first.xp.gained === 30 && second.xp.gained === 0, `wins finished side by side: the second pays no XP (${first.xp.gained}, ${second.xp.gained})`);

  // --- every total is its games' sum, the backfill included
  const off = (await one(`select count(*)::int n from public.profiles p
    where not p.test_account and p.xp <> coalesce((select sum(xp) from public.games g where g.user_id = p.id), 0)`)).n;
  check(off === 0, `every player's XP is the sum of their games' (${off} don't match)`);
  const vet = (await one(`select xp from public.profiles where id = $1`, [old.veteranXp])).xp;
  check(vet === 20, `the backfill pays a past Medium win, not a Ranked loss, a flagged win or an unrated Ranked win (${vet})`);

  // --- name plates (level_plates): a win that reaches level 5 brings the first, equipped
  const pl = await newPlayer();
  await db.exec(`update public.profiles set xp = 190, plate = 0 where id = '${pl}'`); // level 4
  const fifth = await paced(pl, 'casual', 'easy');
  const p5 = await one(`select plate from public.profiles where id = $1`, [pl]);
  check(fifth.xp.level === 5 && fifth.xp.plate === 1 && fifth.xp.plateEquipped && p5.plate === 1,
    `level 5 brings the first plate, equipped (${JSON.stringify(fifth.xp)}, worn ${p5.plate})`);
  // a player who took their plate off keeps that choice when the next one comes
  await as(pl);
  await db.query(`select public.wear_plate(0)`);
  await db.exec(`update public.profiles set xp = 880 where id = '${pl}'`); // level 9
  const tenth = await paced(pl, 'casual', 'medium');
  const p10 = await one(`select plate from public.profiles where id = $1`, [pl]);
  check(tenth.xp.plate === 2 && !tenth.xp.plateEquipped && p10.plate === 0,
    `level 10's plate unlocks, but no plate stays the choice (${JSON.stringify(tenth.xp)}, worn ${p10.plate})`);
  await as(pl);
  await db.query(`select public.wear_plate(2)`);
  let perr = null; try { await db.query(`select public.wear_plate(3)`); } catch (e) { perr = e.message; }
  check((await one(`select plate from public.profiles where id = $1`, [pl])).plate === 2 && perr?.includes('plate_not_owned'),
    `wear any plate the level has unlocked, none beyond (${perr})`);
  const noPlate = await paced(pl, 'casual', 'easy');
  check(noPlate.xp.plate === null, `a win that unlocks nothing names no plate (${noPlate.xp.plate})`);
  perr = null; try { await db.exec(`update public.profiles set plate = 10 where id = '${pl}'`); } catch (e) { perr = e.message; }
  check(perr?.includes('profiles_plate_check'), 'plates stop at 9');
  const buyGone = (await one(`select count(*)::int n from pg_proc where proname = 'buy_plate'`)).n;
  check(buyGone === 0, 'plates can no longer be bought');
  // the refund: every plate bought before, back in full and in the ledger
  const r = await one(`select p.stardust, (select coalesce(sum(stardust), 0)::int from private.ledger where player_id = p.id and reason = 'plate_refund') back
    from public.profiles p where p.id = $1`, [old.plateBuyer]);
  check(r.back === 3500 && r.stardust === 3500, `a plate buyer gets every Stardust back (${JSON.stringify(r)})`);

  // --- the player card shows the level; the column can't be written by a player
  await as(x);
  const card = (await one(`select public.player_card($1) j`, [x])).j;
  check(card.level === (await lv(after)).level, `the player card shows the level (${card.level})`);
  let err = null;
  await db.exec(`set role authenticated`);
  try { await db.query(`update public.profiles set xp = 999999 where id = $1`, [x]); } catch (e) { err = e.message; }
  await db.exec(`reset role`);
  const still = (await one(`select xp from public.profiles where id = $1`, [x])).xp;
  check(still === after, `a player can't write their own XP (${err ? 'refused' : 'no rows changed'}, ${still})`);
}
