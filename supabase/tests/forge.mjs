// The Forge and the sinks: forging, equip, bringing an avatar to life, plates, mends, the catalogue, Spirits, and what the move to whole avatars paid back.
import { db, as, check, newPlayer, play, one, day, today, veteran, players, old } from './harness.mjs';

export default async function () {
  let err = null;
  // --- 5. forging with Stardust, equip
  const e0 = await newPlayer();
  for (let i = 0; i < 3; i++) await play(e0, 'casual', 'medium');
  // (the 3rd solve dropped a blueprint: start from none)
  await db.exec(`delete from public.player_blueprints where player_id = '${e0}'`);
  await db.exec(`update public.profiles set stardust = 2000, spirits = 0 where id = '${e0}'`);
  await as(e0);
  const common = (await db.query(`select id from public.parts where rarity = 'common' and source = 'craft' and id not in (select part_id from public.player_parts where player_id = $1) limit 1`, [e0])).rows[0].id;
  await db.query(`select public.forge_part($1)`, [common]);
  const sd = (await db.query(`select stardust from public.profiles where id = $1`, [e0])).rows[0].stardust;
  check(sd === 1850, `forging a Common without a blueprint costs 150 Stardust (${2000 - sd})`);
  err = null; try { await db.query(`select public.forge_part($1)`, [common]); } catch (e) { err = e.message; }
  check(err?.includes('already_owned'), 'cannot forge it twice');
  const mythic = (await db.query(`select id from public.parts where rarity = 'mythic' limit 1`)).rows[0].id;
  await db.exec(`delete from public.player_parts where player_id = '${e0}' and part_id = '${mythic}'`);
  await db.exec(`update public.profiles set stardust = 1700 where id = '${e0}'`);
  err = null; try { await db.query(`select public.forge_part($1)`, [mythic]); } catch (e) { err = e.message; }
  check(err?.includes('not_enough_stardust'), 'Mythic without a blueprint: 1800 Stardust, not affordable with 1700');
  await db.exec(`update public.profiles set stardust = 1900 where id = '${e0}'`);
  await db.query(`select public.forge_part($1)`, [mythic]);
  const after = (await db.query(`select stardust, spirits from public.profiles where id = $1`, [e0])).rows[0];
  check(after.stardust === 100 && after.spirits === 0, `Mythic: 1800 Stardust, no Spirit needed (${JSON.stringify(after)})`);

  // --- blueprints (migration blueprints): forged cheaply, used up; a Common is free
  const bpPrice = async (rarity, price) => {
    const part = (await one(`select id from public.parts where rarity = $1 and source = 'craft' and season_id = private.parts_season()
      and not private.has_part($2, id) limit 1`, [rarity, e0])).id;
    await db.query(`insert into public.player_blueprints (player_id, part_id) values ($1, $2)`, [e0, part]);
    await db.exec(`update public.profiles set stardust = 1000 where id = '${e0}'`);
    const j = (await one(`select public.forge_part($1) j`, [part])).j;
    const left = (await one(`select stardust from public.profiles where id = $1`, [e0])).stardust;
    const still = (await one(`select count(*)::int n from public.player_blueprints where player_id = $1 and part_id = $2`, [e0, part])).n;
    check(1000 - left === price && j.stardust === price && still === 0, `a ${rarity} blueprint forges for ${price} and is used up (${1000 - left}, ${still} left)`);
  };
  await bpPrice('common', 0);
  await bpPrice('rare', 50);
  await bpPrice('epic', 200);
  await bpPrice('mythic', 500);
  // a drop of a part you hold as a blueprint is a duplicate: Stardust, no second blueprint
  const held = (await one(`select id from public.parts where rarity = 'common' and source = 'craft' and season_id = private.parts_season()
    and not private.has_part($1, id) limit 1`, [e0])).id;
  await db.query(`insert into public.player_blueprints (player_id, part_id) values ($1, $2)`, [e0, held]);
  check(await one(`select private.has_part($1, $2) h`, [e0, held]).then((r) => r.h), 'a blueprint counts as having the part');
  await db.query(`select public.equip_part('${common.split('-')[1]}', $1)`, [common]);
  const eq = (await db.query(`select * from public.avatar_loadouts where player_id = $1`, [e0])).rows[0];
  check(Object.values(eq).includes(common), 'equipped it');

  // --- 6. sinks: bring an avatar to life, plates, mend a Daily
  await db.exec(`update public.profiles set stardust = 20000, spirits = 0 where id = '${e0}'`);
  await as(e0);
  err = null; try { await db.query(`select public.polish_part('s0-avatar-happy')`); } catch (e) { err = e.message; }
  check(err?.includes('not_enough_stardust'), 'bringing an avatar to life needs a Spirit');
  await db.exec(`update public.profiles set spirits = 2 where id = '${e0}'`);
  await db.query(`select public.polish_part('s0-avatar-happy')`);
  const alive = (await db.query(`select polish from public.player_parts where player_id = $1 and part_id = 's0-avatar-happy'`, [e0])).rows[0]?.polish;
  const afterPolish = (await db.query(`select stardust, spirits from public.profiles where id = $1`, [e0])).rows[0];
  check(alive === 1 && afterPolish.stardust === 14000 && afterPolish.spirits === 1, `Happy (free) brought to life: 6000 Stardust and a Spirit (${JSON.stringify(afterPolish)})`);
  err = null; try { await db.query(`select public.polish_part('s0-avatar-happy')`); } catch (e) { err = e.message; }
  check(err?.includes('already_alive'), 'only once');
  const lacking = (await db.query(`select id from public.parts where slot = 'avatar' and source = 'craft' and id not in (select part_id from public.player_parts where player_id = $1) limit 1`, [e0])).rows[0].id;
  err = null; try { await db.query(`select public.polish_part($1)`, [lacking]); } catch (e) { err = e.message; }
  check(err?.includes('not_owned'), 'only avatars you own');
  err = null; try { await db.query(`select public.polish_part('s0-frame-bronze')`); } catch (e) { err = e.message; }
  check(err?.includes('not_owned'), 'frames are never brought to life');
  await db.query(`select public.equip_part('avatar', 's0-avatar-happy')`);
  err = null; try { await db.query(`select public.equip_part('avatar', $1)`, [lacking]); } catch (e) { err = e.message; }
  check(err?.includes('not_owned'), 'can wear Happy, not an avatar you lack');
  await db.exec(`update public.profiles set stardust = 13800 where id = '${e0}'`);
  // (name plates come with the level since level_plates: tests in level.mjs)
  await as(e0);
  if (today > 4) {
    for (let n = 1; n <= 3; n++) await db.query(`select public.mend_daily($1)`, [day(n)]);
    err = null; try { await db.query(`select public.mend_daily($1)`, [day(4)]); } catch (e) { err = e.message; }
    check(err?.includes('no_mends_left'), 'at most 3 mends a month');
    const mends = (await db.query(`select count(*)::int n from public.daily_mends where player_id = $1`, [e0])).rows[0].n;
    check(mends === 3, `3 days mended (${mends})`);
  } else console.log('  (skipped mend checks: too early in the month)');
  // (a day that hasn't started anywhere yet; today itself is open to fill in for players west of UTC)
  err = null; try { await db.query(`select public.mend_daily($1)`, [new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)]); } catch (e) { err = e.message; }
  check(err?.includes('bad_date'), 'a future day cannot be filled in');
  err = null; try { await db.query(`select public.mend_daily($1)`, [new Date(Date.now() - 62 * 86400000).toISOString().slice(0, 10)]); } catch (e) { err = e.message; }
  check(err?.includes('bad_date'), 'an older month cannot be filled in');

  // --- 7. catalogue and access
  const cat = (await db.query(`select rarity, count(*)::int n from public.parts where source = 'craft' group by rarity order by rarity`)).rows;
  console.log('  catalogue', cat.map((r) => `${r.rarity}:${r.n}`).join(' '));
  check(JSON.stringify(cat) === JSON.stringify([{ rarity: 'common', n: 7 }, { rarity: 'epic', n: 3 }, { rarity: 'mythic', n: 2 }, { rarity: 'rare', n: 4 }]), 'Season 0: 11 avatars and 5 frames, 7 Common, 4 Rare, 3 Epic, 2 Mythic (tier_frames)');

  // --- 8. the Spirit: rolled on solves that count toward parts, guaranteed within 500 (B10; was 700)
  const sp = await newPlayer();
  await db.exec(`update public.profiles set spirit_pity = 498 where id = '${sp}'`);
  const s1 = await play(sp, 'casual', 'medium');
  const s2 = await play(sp, 'casual', 'medium');
  check(s2.spirit === true || s1.spirit === true, 'the 500th counted solve brings a Spirit');
  const spirits = (await db.query(`select spirits, spirit_pity from public.profiles where id = $1`, [sp])).rows[0];
  check(spirits.spirits >= 1, `Spirits held: ${spirits.spirits}`);
  for (let i = 0; i < 7; i++) await play(sp, 'casual', 'medium');
  await db.exec(`update public.profiles set spirit_pity = 499 where id = '${sp}'`);
  const s10 = await play(sp, 'casual', 'medium');
  check(s10.spirit === false, 'the 10th solve of a day rolls no Spirit');

  // --- 9. what the move to whole avatars paid back
  const v = (await db.query(`select stardust, spirits from public.profiles where id = $1`, [veteran])).rows[0];
  const vParts = (await db.query(`select part_id, polish from public.player_parts where player_id = $1 order by part_id`, [veteran])).rows;
  const vLoad = (await db.query(`select avatar, frame from public.avatar_loadouts where player_id = $1`, [veteran])).rows[0];
  check(v.stardust === 1000 + 250 + 1400 + 200 && v.spirits === 2, `veteran: Rare sigil 250 + polish III 1400 + frame polish I 200 back, Crowns kept as Spirits (${JSON.stringify(v)})`);
  // (the frame whole_avatars kept went with the faction frames: tier_frames, no refund)
  check(vParts.length === 0, `nothing left: the old frame is gone (${JSON.stringify(vParts)})`);
  check(vLoad.frame === null && vLoad.avatar === null, 'no frame worn; Happy as the avatar');
  await db.exec(`set role authenticated`);
  err = null; try { await db.exec(`update public.player_parts set part_id = part_id`); } catch (e) { err = e.message; }
  check(!!err, `players cannot write their parts (${err?.slice(0, 40)})`);
  await db.exec(`reset role`);
}
