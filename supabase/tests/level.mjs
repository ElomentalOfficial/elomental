// Account level (account_level): XP for every rated win, no daily cap, a level from 50 x L per step.
import { db, as, check, newPlayer, play, one, old, today, day } from './harness.mjs';

export default async function () {
  // one game after another, as a person plays: the player's earlier games finished 2 minutes ago
  // (the pace guard pays no XP for wins finished side by side)
  const paced = async (uid, ...args) => {
    await db.query(`update public.games set finished_at = finished_at - interval '2 minutes' where user_id = $1 and finished_at is not null`, [uid]);
    return play(uid, ...args);
  };
  // --- the curve: level L to L+1 costs 50 x L; reaching L takes 25 x L x (L - 1)
  const lv = async (t) => one(`select level, into_level, need from private.xp_level($1)`, [t]);
  const at = await Promise.all([0, 49, 50, 149, 150, 300, 245000, 247500].map(lv));
  check(JSON.stringify(at.map((r) => [r.level, r.into_level, r.need])) ===
    JSON.stringify([[1, 0, 50], [1, 49, 50], [2, 0, 100], [2, 99, 100], [3, 0, 150], [4, 0, 200], [99, 2450, 4950], [100, 0, 5000]]),
    `the curve: 50 x L XP a level, no cap (${JSON.stringify(at)})`);

  // --- XP by mode, on a win
  const x = await newPlayer();
  const easy = await paced(x, 'casual', 'easy');
  check(easy.xp?.gained === 10 && easy.xp.total === 10 && easy.xp.level === 1 && easy.xp.into === 10 && easy.xp.need === 50 && !easy.xp.levelUp,
    `an Easy win: 10 XP (${JSON.stringify(easy.xp)})`);
  const medium = await paced(x, 'casual', 'medium');
  const hard = await paced(x, 'casual', 'hard');
  check(medium.xp.gained === 20 && hard.xp.gained === 30, `Medium 20, Hard 30 (${medium.xp.gained}, ${hard.xp.gained})`);
  check(hard.xp.total === 60 && hard.xp.level === 2 && hard.xp.levelUp, `60 XP reaches level 2 (${JSON.stringify(hard.xp)})`);
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
  check(last.xp.gained === 10 && last.xp.total === 120, `12 Easy wins in a day: all 12 pay (${JSON.stringify(last.xp)})`);

  // --- the pace guard: two wins finished side by side pay once (a script, not a person)
  const bot = await newPlayer();
  const first = await play(bot, 'casual', 'hard');
  const second = await play(bot, 'casual', 'hard');
  check(first.xp.gained === 30 && second.xp.gained === 0, `wins finished side by side: the second pays no XP (${first.xp.gained}, ${second.xp.gained})`);

  // --- every total is its games' sum, the backfill included
  const off = (await one(`select count(*)::int n from public.profiles p
    where p.xp <> coalesce((select sum(xp) from public.games g where g.user_id = p.id), 0)`)).n;
  check(off === 0, `every player's XP is the sum of their games' (${off} don't match)`);
  const vet = (await one(`select xp from public.profiles where id = $1`, [old.veteranXp])).xp;
  check(vet === 20, `the backfill pays a past Medium win, not a Ranked loss, a flagged win or an unrated Ranked win (${vet})`);

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
