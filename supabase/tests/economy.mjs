// Replays every migration in PGlite (in-memory Postgres, no live database touched) with
// Supabase stand-ins, then exercises the economy: a part every 3rd rated solve with its
// guarantees, duplicates, the daily limit, forging with Stardust, equip, affinity choice,
// influence and standings. `npm run test:db`
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIG = fileURLToPath(new URL('../migrations', import.meta.url));
const db = new PGlite();

// --- Supabase stand-ins
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema extensions;
  -- stand-in for pgcrypto's gen_random_bytes (live has the real one)
  create function extensions.gen_random_bytes(n integer) returns bytea language sql volatile as $$
    select decode(string_agg(lpad(to_hex(floor(random() * 256)::int), 2, '0'), ''), 'hex') from generate_series(1, n) $$;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz, is_anonymous boolean default false,
    raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
`);

const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
// Just before whole_avatars, a player with the old layered parts, polish levels and Crowns,
// to check what the move to whole avatars pays back.
const AVATARS = files.find((f) => f.endsWith('_whole_avatars.sql'));
let veteran = null;
for (const f of files) {
  if (f === AVATARS) {
    veteran = (await db.query(`insert into auth.users default values returning id`)).rows[0].id;
    await db.exec(`
      update public.profiles set stardust = 1000, crowns = 2, affinity = 'fire' where id = '${veteran}';
      insert into public.player_parts (player_id, part_id, how, polish) values
        ('${veteran}', 's0-sigil-fire-2', 'drop', 3), ('${veteran}', 's0-crest-fire', 'starter', 0), ('${veteran}', 's0-frame-fire-1', 'forge', 1);
      insert into public.avatar_loadouts (player_id, sigil, crest, frame) values ('${veteran}', 's0-sigil-fire-2', 's0-crest-fire', 's0-frame-fire-1');`);
  }
  try {
    await db.exec(readFileSync(join(MIG, f), 'utf8'));
  } catch (e) {
    console.log('MIGRATION FAILED:', f, '\n ', e.message);
    process.exit(1);
  }
}
console.log('all', files.length, 'migrations applied');

const SOLVED = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
const as = (uid) => db.exec(`select set_config('test.uid', '${uid}', false)`);
async function newPlayer() {
  const { rows } = await db.query(`insert into auth.users default values returning id`);
  return rows[0].id;
}
async function play(uid, mode, difficulty, opts = {}) {
  const rating = opts.rating ?? 400;
  const { rows } = await db.query(
    `insert into public.games (user_id, mode, difficulty, seed, rating, started_at, date_key, audit)
     values ($1, $2, $3, 's', $4, now() - ($7 || ' seconds')::interval, $5, $6) returning id`,
    [uid, mode, difficulty, rating, mode === 'daily' ? opts.date : null,
     mode === 'ranked' && !opts.noAudit ? JSON.stringify({ copied: false, solution: SOLVED, rating }) : null, opts.instant ? '2' : '1200']);
  await as(uid);
  const r = await db.query(`select public.finish_game($1, $2, $3, $4, $7, $5, $6) as j`,
    [rows[0].id, opts.won ?? true, opts.mistakes ?? 0, opts.hints ?? 0, rating, SOLVED, opts.instant ? 2 : 1200]);
  return r.rows[0].j;
}
const fails = [];
const check = (ok, what) => { console.log(ok ? '  ok ' : '  FAIL', what); if (!ok) fails.push(what); };

// --- 1. a part every 3rd solve, rarities, guarantees (spread over days so the limit doesn't bite)
const a = await newPlayer();
const tally = { common: 0, rare: 0, epic: 0, mythic: 0 };
let solves = 0, drops = 0, dupes = 0, gapEpic = 0, maxGapEpic = 0, gapMythic = 0, maxGapMythic = 0, progressOk = true;
for (let i = 0; i < 900; i++) {
  if (i % 9 === 0) await db.exec(`update public.games set finished_at = finished_at - interval '1 day' where user_id = '${a}'`);
  const j = await play(a, 'ranked', 'medium', { rating: 500 });
  solves++;
  if (!j.progress || j.progress.count !== solves % 3) progressOk = false;
  const d = j.drop;
  if ((solves % 3 === 0) !== !!d) progressOk = false;
  if (!d) continue;
  drops++; tally[d.rarity]++;
  if (d.duplicate) dupes++;
  gapEpic = d.rarity === 'epic' || d.rarity === 'mythic' ? 0 : gapEpic + 1; maxGapEpic = Math.max(maxGapEpic, gapEpic);
  gapMythic = d.rarity === 'mythic' ? 0 : gapMythic + 1; maxGapMythic = Math.max(maxGapMythic, gapMythic);
}
console.log(`\n900 rated solves -> ${drops} parts:`, Object.entries(tally).map(([k, v]) => `${k} ${(v / drops * 100).toFixed(1)}%`).join(', '), `duplicates ${dupes}`);
check(drops === 300 && progressOk, 'exactly every 3rd solve drops a part, and the counter matches');
check(maxGapEpic <= 9, `Epic or better within 10 parts (longest wait ${maxGapEpic})`);
check(maxGapMythic <= 24, `Mythic within 25 parts (longest wait ${maxGapMythic})`);
const owned = (await db.query(`select count(*)::int n from public.player_parts where player_id = $1`, [a])).rows[0].n;
check(owned === 23, `300 parts collect the whole 23-part set (${owned})`);
const dupDust = (await db.query(`select coalesce(sum(stardust),0)::int s from public.drops where player_id = $1 and duplicate`, [a])).rows[0].s;
check(dupDust > 0, `duplicates paid Stardust (${dupDust})`);

// --- 2. the daily limit: counting stops after 9 solves (3 parts)
const b = await newPlayer();
let partsToday = 0, lastProgress = null;
for (let i = 0; i < 40; i++) { const j = await play(b, 'casual', 'medium'); if (j.drop) partsToday++; if (j.progress) lastProgress = j.progress; else lastProgress = 'stopped'; }
check(partsToday === 3 && lastProgress === 'stopped', `40 solves in one day: 3 parts, then counting stops (${partsToday})`);

// --- 3. losses and unrated: nothing counts
const c = await newPlayer();
const lost = await play(c, 'ranked', 'medium', { won: false });
check(lost.drop === null && lost.progress === null, 'a loss counts for nothing');

// --- 4. affinity: too soon, choose, influence
const d0 = await newPlayer();
await as(d0);
let err = null;
try { await db.query(`select public.choose_affinity('fire')`); } catch (e) { err = e.message; }
check(err?.includes('too_soon'), 'affinity needs 3 solved squares first');
for (let i = 0; i < 3; i++) await play(d0, 'casual', 'hard');
await as(d0);
const ch = (await db.query(`select public.choose_affinity('water') as j`)).rows[0].j;
check(ch.affinity === 'water' && !('crest' in ch), 'choosing sets the affinity (no crest part any more)');
const inf = await play(d0, 'daily', 'medium', { date: '2026-10-20' });
check(inf.influence?.affinity === 'water' && inf.influence.amount === 5, `daily clean solve: +5 influence (${JSON.stringify(inf.influence)})`);
await as(d0);
const st = (await db.query(`select * from public.affinity_standings() order by affinity`)).rows;
check(st.find((r) => r.affinity === 'water').members === 1, 'standings count the member');

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
await db.exec(`update public.profiles set stardust = 13800 where id = '${e0}'`);for (let i = 0; i < 2; i++) await db.query(`select public.buy_plate()`);
const pl = (await db.query(`select plate, stardust from public.profiles where id = $1`, [e0])).rows[0];
check(pl.plate === 2 && pl.stardust === 13800 - 3500, `Bronze then Silver plate: 3500 (${JSON.stringify(pl)})`);
const ym = new Date(); const day = (n) => `${ym.getUTCFullYear()}-${String(ym.getUTCMonth() + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
const today = ym.getUTCDate();
if (today > 4) {
  for (let n = 1; n <= 3; n++) await db.query(`select public.mend_daily($1)`, [day(n)]);
  err = null; try { await db.query(`select public.mend_daily($1)`, [day(4)]); } catch (e) { err = e.message; }
  check(err?.includes('no_mends_left'), 'at most 3 mends a month');
  const mends = (await db.query(`select count(*)::int n from public.daily_mends where player_id = $1`, [e0])).rows[0].n;
  check(mends === 3, `3 days mended (${mends})`);
} else console.log('  (skipped mend checks: too early in the month)');
err = null; try { await db.query(`select public.mend_daily($1)`, [day(today)]); } catch (e) { err = e.message; }
check(err?.includes('bad_date'), 'today cannot be mended');

// --- 7. catalogue and access
const cat = (await db.query(`select rarity, count(*)::int n from public.parts where source = 'craft' group by rarity order by rarity`)).rows;
console.log('  catalogue', cat.map((r) => `${r.rarity}:${r.n}`).join(' '));
check(JSON.stringify(cat) === JSON.stringify([{ rarity: 'common', n: 9 }, { rarity: 'epic', n: 6 }, { rarity: 'mythic', n: 1 }, { rarity: 'rare', n: 7 }]), 'Season 0: 11 avatars and 12 frames, 9 Common, 7 Rare, 6 Epic, 1 Mythic');

// --- 8. the Spirit: rolled on solves that count toward parts, guaranteed within 700
const sp = await newPlayer();
await db.exec(`update public.profiles set spirit_pity = 698 where id = '${sp}'`);
const s1 = await play(sp, 'casual', 'medium');
const s2 = await play(sp, 'casual', 'medium');
check(s2.spirit === true || s1.spirit === true, 'the 700th counted solve brings a Spirit');
const spirits = (await db.query(`select spirits, spirit_pity from public.profiles where id = $1`, [sp])).rows[0];
check(spirits.spirits >= 1, `Spirits held: ${spirits.spirits}`);
for (let i = 0; i < 7; i++) await play(sp, 'casual', 'medium');
await db.exec(`update public.profiles set spirit_pity = 699 where id = '${sp}'`);
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

// --- 10. dev mode: founders only, and only while it's on
const plain = await newPlayer();
await as(plain);
err = null; try { await db.query(`select public.dev_set_mode(true)`); } catch (e) { err = e.message; }
check(err?.includes('not_admin'), 'dev mode: not for players who aren\'t founders');
const fo = (await db.query(`insert into auth.users (email, email_confirmed_at) values ('founder@example.test', now()) returning id`)).rows[0].id;
await db.exec(`insert into private.founders (email) values ('founder@example.test')`);
await as(fo);
err = null; try { await db.query(`select public.dev_action('fill')`); } catch (e) { err = e.message; }
check(err?.includes('dev_off'), 'dev tools need dev mode on');
let quick = null; try { await play(fo, 'casual', 'medium', { instant: true }); } catch (e) { quick = e.message; }
check(quick?.includes('too_fast'), 'an instant solve is refused while dev mode is off');
await as(fo);
await db.query(`select public.dev_set_mode(true)`);
await db.query(`select public.dev_action('fill')`);
const filled = (await db.query(`select stardust, spirits from public.profiles where id = $1`, [fo])).rows[0];
check(filled.stardust === 999999 && filled.spirits === 99, `fill: 999999 Stardust and 99 Spirits (${JSON.stringify(filled)})`);
await db.query(`select public.dev_action('next_drop', 'mythic')`);
const forced = await play(fo, 'casual', 'medium', { instant: true });
check(forced.drop?.rarity === 'mythic', `next part Mythic, on an instant solve (${forced.drop?.rarity})`);
await as(fo);
await db.query(`select public.dev_action('next_spirit')`);
const spiritNow = await play(fo, 'casual', 'medium', { instant: true });
check(spiritNow.spirit === true, 'next solve brings a Spirit');
let counted = 0;
for (let i = 0; i < 12; i++) { const j = await play(fo, 'casual', 'medium', { instant: true }); if (j.progress) counted++; }
check(counted === 12, `no daily limit in dev mode (${counted} of 12 counted)`);
const rankedDev = await play(fo, 'ranked', 'medium', { instant: true, noAudit: true });
check(rankedDev.elo?.unrated === null && rankedDev.elo.after > rankedDev.elo.before, `Ranked instant solve counts as rated (${JSON.stringify(rankedDev.elo)})`);
await as(fo);
await db.query(`select public.dev_action('unlock_all')`);
const all = (await db.query(`select count(*)::int n from public.player_parts where player_id = $1`, [fo])).rows[0].n;
check(all === 23, `unlock every part (${all})`);
await db.query(`select public.dev_action('elo', '2500')`);
await db.query(`select public.dev_action('plate', '4')`);
const set = (await db.query(`select elo, plate from public.profiles where id = $1`, [fo])).rows[0];
check(set.elo === 2500 && set.plate === 4, `set Elo and plate (${JSON.stringify(set)})`);
await db.query(`select public.dev_action('clear_parts')`);
const none = (await db.query(`select count(*)::int n from public.player_parts where player_id = $1`, [fo])).rows[0].n;
check(none === 0, 'remove every part');
await db.query(`select public.dev_set_mode(false)`);
err = null; try { await db.query(`select public.dev_action('fill')`); } catch (e) { err = e.message; }
check(err?.includes('dev_off'), 'dev tools stop when dev mode is off');

console.log(fails.length ? `\n${fails.length} FAILED` : '\nall checks passed');
process.exit(fails.length ? 1 : 0);