// The Forge and the sinks: forging, equip, bringing an avatar to life, plates, mends, the catalogue, Spirits, and what the move to whole avatars paid back.
import { db, as, check, newPlayer, play, one, day, today, veteran, players, old } from './harness.mjs';

export default async function () {
  let err = null;
  // --- 5. forging with Stardust, equip
  const e0 = await newPlayer();
  for (let i = 0; i < 3; i++) await play(e0, 'casual', 'medium');
  await db.exec(`update public.profiles set stardust = 2000, spirits = 0 where id = '${e0}'`);
  await as(e0);
  const common = (await db.query(`select id from public.parts where rarity = 'common' and source = 'craft' and id not in (select part_id from public.player_parts where player_id = $1) limit 1`, [e0])).rows[0].id;
  await db.query(`select public.forge_part($1)`, [common]);
  const sd = (await db.query(`select stardust from public.profiles where id = $1`, [e0])).rows[0].stardust;
  check(sd === 1900, `forging a Common costs 100 Stardust (${2000 - sd})`);
  err = null; try { await db.query(`select public.forge_part($1)`, [common]); } catch (e) { err = e.message; }
  check(err?.includes('already_owned'), 'cannot forge it twice');
  const mythic = (await db.query(`select id from public.parts where rarity = 'mythic' limit 1`)).rows[0].id;
  // (one of the 3 solves above may have dropped it)
  await db.exec(`delete from public.player_parts where player_id = '${e0}' and part_id = '${mythic}'`);
  await db.exec(`update public.profiles set stardust = 1000 where id = '${e0}'`);
  err = null; try { await db.query(`select public.forge_part($1)`, [mythic]); } catch (e) { err = e.message; }
  check(err?.includes('not_enough_stardust'), 'Mythic: 1200 Stardust, not affordable with 1000');
  await db.exec(`update public.profiles set stardust = 1900 where id = '${e0}'`);
  await db.query(`select public.forge_part($1)`, [mythic]);
  const after = (await db.query(`select stardust, spirits from public.profiles where id = $1`, [e0])).rows[0];
  check(after.stardust === 700 && after.spirits === 0, `Mythic: 1200 Stardust, no Spirit needed (${JSON.stringify(after)})`);
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
  err = null; try { await db.query(`select public.polish_part('s0-frame-fire-1')`); } catch (e) { err = e.message; }
  check(err?.includes('not_owned'), 'frames are never brought to life');
  await db.query(`select public.equip_part('avatar', 's0-avatar-happy')`);
  err = null; try { await db.query(`select public.equip_part('avatar', $1)`, [lacking]); } catch (e) { err = e.message; }
  check(err?.includes('not_owned'), 'can wear Happy, not an avatar you lack');
  await db.exec(`update public.profiles set stardust = 13800 where id = '${e0}'`);
  err = null; try { await db.query(`select public.buy_plate(2)`); } catch (e) { err = e.message; }
  check(err?.includes('plate_order'), 'plates in order: Silver before Bronze is refused');
  await db.query(`select public.buy_plate(1)`);
  err = null; try { await db.query(`select public.buy_plate(1)`); } catch (e) { err = e.message; }
  check(err?.includes('plate_owned'), 'a repeated tap doesn\'t buy the next plate');
  await db.query(`select public.buy_plate(2)`);
  const pl = (await db.query(`select plate, stardust from public.profiles where id = $1`, [e0])).rows[0];
  check(pl.plate === 2 && pl.stardust === 13800 - 3500, `Bronze then Silver plate: 3500 (${JSON.stringify(pl)})`);
  // diamond_plate: five plates, Diamond between Gold and Starforged; Starforged holders keep it
  const top = await newPlayer();
  await db.exec(`update public.profiles set plate = 3, stardust = 30000 where id = '${top}'`);
  await as(top);
  err = null; try { await db.query(`select public.buy_plate(5)`); } catch (e) { err = e.message; }
  check(err?.includes('plate_order'), 'Diamond comes before Starforged');
  await db.query(`select public.buy_plate(4)`);
  await db.query(`select public.buy_plate(5)`);
  const tp = await one(`select plate, stardust from public.profiles where id = $1`, [top]);
  check(tp.plate === 5 && tp.stardust === 30000 - 9000 - 14000, `Diamond 9000, then Starforged 14000 (${JSON.stringify(tp)})`);
  err = null; try { await db.query(`select public.buy_plate(6)`); } catch (e) { err = e.message; }
  check(err?.includes('top_plate'), 'nothing past Starforged');
  err = null; try { await db.exec(`update public.profiles set plate = 6 where id = '${top}'`); } catch (e) { err = e.message; }
  check(err?.includes('profiles_plate_check'), 'plates stop at 5');
  const kept = await one(`select plate from public.profiles where id = $1`, [old.starforged]);
  check(kept.plate === 5, `a Starforged holder keeps Starforged, now plate 5 (${kept.plate})`);
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
  check(JSON.stringify(cat) === JSON.stringify([{ rarity: 'common', n: 9 }, { rarity: 'epic', n: 6 }, { rarity: 'mythic', n: 5 }, { rarity: 'rare', n: 7 }]), 'Season 0: 11 avatars and 16 frames, 9 Common, 7 Rare, 6 Epic, 5 Mythic (B10: four Mythic frames)');

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
  check(JSON.stringify(vParts) === JSON.stringify([{ part_id: 's0-frame-fire-1', polish: 0 }]), `only the frame stays (${JSON.stringify(vParts)})`);
  check(vLoad.frame === 's0-frame-fire-1' && vLoad.avatar === null, 'still wears the frame; Happy as the avatar');
  await db.exec(`set role authenticated`);
  err = null; try { await db.exec(`update public.player_parts set part_id = part_id`); } catch (e) { err = e.message; }
  check(!!err, `players cannot write their parts (${err?.slice(0, 40)})`);
  await db.exec(`reset role`);
}
