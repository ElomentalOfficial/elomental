// Marks (migration marks): the frame you wear earns a mark every 40 rated wins, up to 3. A win
// counts when it paid XP; it goes to the frame worn; taking a frame off keeps what it earned.
import { db, as, check, newPlayer, play, one } from './harness.mjs';

export default async function () {
  // one game after another, as a person plays (the pace guard pays no XP side by side)
  const paced = async (uid, ...args) => {
    await db.query(`update public.games set finished_at = finished_at - interval '2 minutes' where user_id = $1 and finished_at is not null`, [uid]);
    return play(uid, ...args);
  };
  const wins = async (uid, part) => (await one(`select wins from public.player_parts where player_id = $1 and part_id = $2`, [uid, part]))?.wins;

  const m = await newPlayer();
  await db.query(`insert into public.player_parts (player_id, part_id, how) values ($1, 's0-frame-air-1', 'forge'), ($1, 's0-frame-air-2', 'forge')`, [m]);
  // no frame worn: nothing to count
  await paced(m, 'casual', 'easy');
  check(await wins(m, 's0-frame-air-1') === 0, 'no frame worn: no win counted');
  await as(m);
  await db.query(`select public.equip_part('frame', 's0-frame-air-1')`);
  for (let i = 0; i < 3; i++) await paced(m, 'casual', 'easy');
  check(await wins(m, 's0-frame-air-1') === 3, `the worn frame counts each rated win (${await wins(m, 's0-frame-air-1')})`);
  // a loss, and a win side by side (no XP), count for nothing
  await paced(m, 'casual', 'easy', { won: false });
  check(await wins(m, 's0-frame-air-1') === 3, 'a loss counts nothing');
  await paced(m, 'casual', 'easy');
  await play(m, 'casual', 'easy');
  check(await wins(m, 's0-frame-air-1') === 4, 'a win finished side by side with another (no XP) counts nothing');
  // switch frames: the first keeps its wins, the new one counts from here
  await as(m);
  await db.query(`select public.equip_part('frame', 's0-frame-air-2')`);
  await paced(m, 'casual', 'easy');
  check(await wins(m, 's0-frame-air-1') === 4 && await wins(m, 's0-frame-air-2') === 1, 'a frame taken off keeps its wins; the new one counts');
  // the cap: 120 wins (3 marks)
  await db.query(`update public.player_parts set wins = 119 where player_id = $1 and part_id = 's0-frame-air-2'`, [m]);
  await paced(m, 'casual', 'easy');
  await paced(m, 'casual', 'easy');
  check(await wins(m, 's0-frame-air-2') === 120, `three marks at most (120 wins: ${await wins(m, 's0-frame-air-2')})`);
  // players can't write it themselves: no update on player_parts for the API roles
  const can = (await one(`select has_table_privilege('authenticated', 'public.player_parts', 'UPDATE') u`)).u;
  check(!can, 'players cannot set their own wins');

  // --- gilding (migration gilding): 3 marks, once, for Stardust by rarity
  await as(m);
  const gild = (part) => db.query(`select public.gild_part($1) j`, [part]).then((r) => r.rows[0].j, (e) => e.message);
  await db.query(`update public.profiles set stardust = 5000 where id = $1`, [m]);
  check(String(await gild('s0-frame-air-1')).includes('needs_marks'), 'a frame without 3 marks can\'t be gilded');
  check(String(await gild('s0-frame-fire-1')).includes('not_owned'), 'a frame you don\'t own can\'t be gilded');
  check(String(await gild('s0-avatar-calm')).includes('not_gildable'), 'an avatar can\'t be gilded');
  const g = await gild('s0-frame-air-2');
  const left = (await one(`select stardust from public.profiles where id = $1`, [m])).stardust;
  check(g.stardust === 1500 && left === 3500, `a Rare frame with 3 marks gilds for 1500 Stardust (${JSON.stringify(g)}, ${left} left)`);
  check(String(await gild('s0-frame-air-2')).includes('already_gilded'), 'once only');
  await db.query(`update public.player_parts set wins = 120 where player_id = $1 and part_id = 's0-frame-air-1'`, [m]);
  await db.query(`update public.profiles set stardust = 999 where id = $1`, [m]);
  check(String(await gild('s0-frame-air-1')).includes('not_enough_stardust'), 'a Common needs 1000 Stardust');
  const led = (await one(`select count(*)::int n, sum(stardust)::int s from private.ledger where player_id = $1 and reason = 'gild'`, [m]));
  check(led.n === 1 && led.s === -1500, `gilding is in the ledger (${JSON.stringify(led)})`);
  // the rim shows to others: only players wearing a gilded frame
  const other = await newPlayer();
  const gilt = (await one(`select public.gilt_players($1::uuid[]) a`, [[m, other]])).a;
  check(gilt.length === 1 && gilt[0] === m, `gilt_players names those wearing a gilded frame (${gilt})`);
  await db.query(`select public.equip_part('frame', 's0-frame-air-1')`);
  check((await one(`select public.gilt_players($1::uuid[]) a`, [[m]])).a.length === 0, 'wearing an ungilded frame: no rim');
}
