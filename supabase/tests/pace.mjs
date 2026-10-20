// Economy pace (batch B10): Call a Spirit, a complete rarity.
import { db, as, check, newPlayer, play, one, players } from './harness.mjs';

export default async function () {
  const { a } = players;
  let err = null;
  // --- 15. economy pace (docs/FULL_REVIEW.md, batch B10): Call a Spirit, a complete rarity
  const cs = await newPlayer();
  await db.exec(`update public.profiles set stardust = 40000, spirits = 0 where id = '${cs}'`);
  await as(cs);
  const call1 = (await one(`select public.call_spirit() j`)).j;
  check(call1.cost === 15000 && call1.next === 20000 && call1.spirits === 1, `M3 the first Spirit called costs 15,000 (${JSON.stringify(call1)})`);
  err = null; try { await db.query(`select public.call_spirit()`); } catch (e) { err = e.message; }
  check(err?.includes('no_avatar_to_wake'), 'M3 not while every avatar you own has a Spirit waiting (Happy alone, one Spirit held)');
  await db.exec(`insert into public.player_parts (player_id, part_id, how) values ('${cs}', 's0-avatar-calm', 'drop')`);
  const call2 = (await one(`select public.call_spirit() j`)).j;
  check(call2.cost === 20000, `M3 the next one this season costs 5,000 more (${call2.cost})`);
  await db.exec(`insert into public.player_parts (player_id, part_id, how) values ('${cs}', 's0-avatar-sad', 'drop')`);
  err = null; try { await db.query(`select public.call_spirit()`); } catch (e) { err = e.message; }
  check(err?.includes('not_enough_stardust'), 'M3 25,000 with 5,000 held is refused');
  await db.exec(`update public.profiles set stardust = 15000, spirits_called_season = spirits_called_season - 1 where id = '${cs}'`);
  const call3 = (await one(`select public.call_spirit() j`)).j;
  check(call3.cost === 15000, `M3 a new season starts the price again (${call3.cost})`);
  const csLedger = (await one(`select count(*)::int n, sum(stardust)::int s, sum(spirits)::int k from private.ledger where player_id = $1 and reason = 'call_spirit'`, [cs]));
  const csNow = await one(`select stardust, spirits from public.profiles where id = $1`, [cs]);
  check(csLedger.n === 3 && csLedger.s === -50000 && csLedger.k === 3 && csNow.stardust === 0 && csNow.spirits === 3,
    `M3 each call is in the ledger (${JSON.stringify(csLedger)}, ${JSON.stringify(csNow)})`);

  // an avatar already brought to life counts as having its Spirit
  await db.exec(`update public.profiles set stardust = 50000, spirits = 0 where id = '${cs}';
    update public.player_parts set polish = 1 where player_id = '${cs}' and part_id in ('s0-avatar-calm', 's0-avatar-sad');
    insert into public.player_parts (player_id, part_id, how, polish) values ('${cs}', 's0-avatar-happy', 'starter', 1)`);
  err = null; try { await db.query(`select public.call_spirit()`); } catch (e) { err = e.message; }
  check(err?.includes('no_avatar_to_wake'), 'M3 avatars already alive need no Spirit');

  // every Mythic part owned: the drop says so, so the guarantee line can be honest
  const full = await newPlayer();
  await db.exec(`insert into public.player_parts (player_id, part_id, how)
    select '${full}', id, 'forge' from public.parts where source = 'craft' and rarity in ('epic', 'mythic')`);
  let fullDrop = null;
  for (let i = 0; i < 3; i++) fullDrop = (await play(full, 'casual', 'medium')).drop ?? fullDrop;
  check(fullDrop?.complete?.mythic === true && fullDrop.complete.epic === true, `M6 a drop says every Epic and Mythic part is owned (${JSON.stringify(fullDrop?.complete)})`);
  const partial = (await play(a, 'ranked', 'medium', { rating: 500 }));
  check(partial.drop === null || typeof partial.drop.complete?.mythic === 'boolean', 'M6 every drop says it');
}
