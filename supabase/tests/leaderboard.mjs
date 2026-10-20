// The leaderboard: lists, search, follows, cards, showcase, the affinity month.
import { db, as, check, lbPlayer, players } from './harness.mjs';

export default async function () {
  let err = null;
  // --- 11. the leaderboard
  const ana = await lbPlayer('Anastasia', 2400, ", affinity = 'fire', country = 'RO'");
  const bob = await lbPlayer('Bogdan', 1800, ", affinity = 'water', country = 'RO'");
  const cata = await lbPlayer('Catalina', 1500, ", affinity = 'fire'");
  // (above every Elo the sections before reach)
  const ghost = await lbPlayer('Ghostly', 5000, ', lb_hidden = true');
  const dan = await lbPlayer('Daniela', 1200, ", affinity = 'fire', country = 'GB'");
  await db.exec(`select private.refresh_lb()`);
  await as(cata);
  const glob = (await db.query(`select public.lb_page('global') as j`)).rows[0].j;
  const names = glob.rows.map((r) => r.name);
  check(names.indexOf('Anastasia') < names.indexOf('Bogdan') && names.indexOf('Bogdan') < names.indexOf('Catalina'), `global: best Elo first (${names.slice(0, 5).join(', ')})`);
  check(!names.includes('Ghostly'), 'hidden players aren\'t listed');
  check(glob.rows.find((r) => r.name === 'Catalina')?.me === true, 'your own row is marked');
  const fire = (await db.query(`select public.lb_page('faction') as j`)).rows[0].j;
  check(fire.scope === 'fire' && fire.rows.map((r) => r.name).join() === 'Anastasia,Catalina,Daniela', `faction view defaults to yours (${fire.rows.map((r) => r.name).join()})`);
  const ro = (await db.query(`select public.lb_page('country', 0, 'ro') as j`)).rows[0].j;
  check(ro.rows.map((r) => r.name).join() === 'Anastasia,Bogdan', `country view (${ro.rows.map((r) => r.name).join()})`);
  const around = (await db.query(`select public.lb_around_me('global') as j`)).rows[0].j;
  check(around.place > 0 && around.rows.some((r) => r.me), `around me: place ${around.place}, with you in the window`);
  const meBar = (await db.query(`select public.lb_me('global') as j`)).rows[0].j;
  check(meBar.place === around.place && meBar.total >= 4, `the pinned bar: #${meBar.place} of ${meBar.total}`);
  await as(ghost);
  const ghostBar = (await db.query(`select public.lb_me('global') as j`)).rows[0].j;
  check(ghostBar.hidden === true && ghostBar.place === 1 && ghostBar.listed === false, `a hidden player still sees the place they'd have (#${ghostBar.place})`);
  await as(cata);
  const found = (await db.query(`select public.lb_search('ana') as j`)).rows[0].j;
  check(found[0]?.name === 'Anastasia', `search: prefix first (${found.map((r) => r.name).join()})`);
  const typo = (await db.query(`select public.lb_search('bogdna') as j`)).rows[0].j;
  check(typo.some((r) => r.name === 'Bogdan'), `search: a typo still finds the name (${typo.map((r) => r.name).join()})`);
  const hiddenSearch = (await db.query(`select public.lb_search('ghost') as j`)).rows[0].j;
  check(hiddenSearch.length === 0, 'search leaves hidden players out');
  err = null; try { for (let i = 0; i < 40; i++) await db.query(`select public.lb_search('cat')`); } catch (e) { err = e.message; }
  check(err?.includes('slow_down'), 'search: 30 a minute, then slow down');
  await db.query(`select public.follow($1)`, [ana]);
  const friends = (await db.query(`select public.lb_page('friends') as j`)).rows[0].j;
  check(friends.rows.map((r) => r.name).join() === 'Anastasia,Catalina' && friends.rows[1].place === 2, `friends: who you follow and you (${friends.rows.map((r) => `${r.place}.${r.name}`).join()})`);
  err = null; try { await db.query(`select public.follow($1)`, [ghost]); } catch (e) { err = e.message; }
  check(err?.includes('no_player'), 'can\'t follow a hidden player');
  const card = (await db.query(`select public.player_card($1) as j`, [ana])).rows[0].j;
  check(card.name === 'Anastasia' && card.following === true && card.place === glob.rows.find((r) => r.name === 'Anastasia').place && card.stats?.ranked === 5, `card: name, place, following, stats (${JSON.stringify({ place: card.place, following: card.following })})`);
  const hiddenCard = (await db.query(`select public.player_card($1) as j`, [ghost])).rows[0].j;
  check(hiddenCard.hidden === true && !hiddenCard.name, 'a hidden player\'s card shows nothing');
  await as(ana);
  await db.query(`select public.set_card_privacy(null, false)`);
  await as(cata);
  const private1 = (await db.query(`select public.player_card($1) as j`, [ana])).rows[0].j;
  check(private1.stats === null, 'stats hidden when the player turns them off');
  err = null; try { await db.query(`select public.set_showcase(array['win-2026-09-fire'])`); } catch (e) { err = e.message; }
  check(err?.includes('not_owned'), 'showcase: only badges you own')
  const tiers = (await db.query(`select public.lb_tiers() as j`)).rows[0].j;
  check(tiers.tiers.length === 5 && tiers.tiers.reduce((n, t) => n + Number(t.players), 0) === Number(tiers.total), `tiers add up (${tiers.tiers.map((t) => t.players).join('/')} of ${tiers.total})`);
  await db.exec(`insert into public.affinity_months (month, player_id, affinity, influence, solves) values
    ('2026-09-01', '${ana}', 'fire', 40, 10), ('2026-09-01', '${cata}', 'fire', 20, 5), ('2026-09-01', '${bob}', 'water', 25, 5)`);
  const before = (await db.query(`select stardust from public.profiles where id = $1`, [cata])).rows[0].stardust;
  const win = (await db.query(`select private.settle_faction_month('2026-09-01') as w`)).rows[0].w;
  await db.query(`select private.settle_faction_month('2026-09-01')`);
  const after2 = (await db.query(`select stardust from public.profiles where id = $1`, [cata])).rows[0].stardust;
  const badges = (await db.query(`select badge from public.player_badges where player_id = $1`, [cata])).rows.map((r) => r.badge);
  check(win === 'fire' && after2 - before === 300 && badges.join() === 'win-2026-09-fire', `settled: Fire wins; badge and 300 Stardust once (${after2 - before}, ${badges.join()})`);
  await as(cata);
  await db.query(`select public.set_showcase(array['win-2026-09-fire'])`);
  const shown = (await db.query(`select public.player_card($1) as j`, [cata])).rows[0].j;
  check(JSON.stringify(shown.showcase) === '["win-2026-09-fire"]', `showcase: your chosen badge on your card (${JSON.stringify(shown.showcase)})`);
  const auto = (await db.query(`select public.player_card($1) as j`, [ana])).rows[0].j;
  check(JSON.stringify(auto.showcase) === '["win-2026-09-fire"]', 'none chosen: the newest badges show');
  const board = (await db.query(`select public.faction_board() as j`)).rows[0].j;
  check(board.mine === 'fire' && board.standings.length === 4 && board.lastWinner?.winner === 'fire', `faction board (mine ${board.mine}, last winner ${board.lastWinner?.winner})`);
  Object.assign(players, { ana, cata });
}
