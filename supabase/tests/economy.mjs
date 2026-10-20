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
for (const f of files) {
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
     values ($1, $2, $3, 's', $4, now() - interval '20 minutes', $5, $6) returning id`,
    [uid, mode, difficulty, rating, mode === 'daily' ? opts.date : null,
     mode === 'ranked' ? JSON.stringify({ copied: false, solution: SOLVED, rating }) : null]);
  await as(uid);
  const r = await db.query(`select public.finish_game($1, $2, $3, $4, 1200, $5, $6) as j`,
    [rows[0].id, opts.won ?? true, opts.mistakes ?? 0, opts.hints ?? 0, rating, SOLVED]);
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
check(owned === 48, `300 parts collect the whole 48-part set (${owned})`);
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

// --- 4. affinity: too soon, choose, influence, crest
const d0 = await newPlayer();
await as(d0);
let err = null;
try { await db.query(`select public.choose_affinity('fire')`); } catch (e) { err = e.message; }
check(err?.includes('too_soon'), 'affinity needs 3 solved squares first');
for (let i = 0; i < 3; i++) await play(d0, 'casual', 'hard');
await as(d0);
const ch = (await db.query(`select public.choose_affinity('water') as j`)).rows[0].j;
check(ch.crest === 's0-crest-water', 'choosing gives the Water crest');
const lo = (await db.query(`select crest from public.avatar_loadouts where player_id = $1`, [d0])).rows[0];
check(lo?.crest === 's0-crest-water', 'and wears it');
const inf = await play(d0, 'daily', 'medium', { date: '2026-10-20' });
check(inf.influence?.affinity === 'water' && inf.influence.amount === 5, `daily clean solve: +5 influence (${JSON.stringify(inf.influence)})`);
await as(d0);
const st = (await db.query(`select * from public.affinity_standings() order by affinity`)).rows;
check(st.find((r) => r.affinity === 'water').members === 1, 'standings count the member');

// --- 5. forging with Stardust, equip
const e0 = await newPlayer();
for (let i = 0; i < 3; i++) await play(e0, 'casual', 'medium');
await db.exec(`update public.profiles set stardust = 2000, crowns = 0 where id = '${e0}'`);
await as(e0);
const common = (await db.query(`select id from public.parts where rarity = 'common' and source = 'craft' and id not in (select part_id from public.player_parts where player_id = $1) limit 1`, [e0])).rows[0].id;
await db.query(`select public.forge_part($1)`, [common]);
const sd = (await db.query(`select stardust from public.profiles where id = $1`, [e0])).rows[0].stardust;
check(sd === 1900, `forging a Common costs 100 Stardust (${2000 - sd})`);
err = null; try { await db.query(`select public.forge_part($1)`, [common]); } catch (e) { err = e.message; }
check(err?.includes('already_owned'), 'cannot forge it twice');
const mythic = (await db.query(`select id from public.parts where rarity = 'mythic' limit 1`)).rows[0].id;
err = null; try { await db.query(`select public.forge_part($1)`, [mythic]); } catch (e) { err = e.message; }
check(err?.includes('not_enough_stardust'), 'Mythic needs a Rusted Crown too');
await db.exec(`update public.profiles set crowns = 1 where id = '${e0}'`);
await db.query(`select public.forge_part($1)`, [mythic]);
const after = (await db.query(`select stardust, crowns from public.profiles where id = $1`, [e0])).rows[0];
check(after.stardust === 700 && after.crowns === 0, `Mythic: 1200 Stardust and a Crown (${JSON.stringify(after)})`);
await db.query(`select public.equip_part('${common.split('-')[1]}', $1)`, [common]);
const eq = (await db.query(`select * from public.avatar_loadouts where player_id = $1`, [e0])).rows[0];
check(Object.values(eq).includes(common), 'equipped it');

// --- 6. sinks: polish, plates, mend a Daily
await db.exec(`update public.profiles set stardust = 20000 where id = '${e0}'`);
await as(e0);
for (let i = 0; i < 5; i++) await db.query(`select public.polish_part($1)`, [common]);
const pol = (await db.query(`select polish from public.player_parts where player_id = $1 and part_id = $2`, [e0, common])).rows[0].polish;
const afterPolish = (await db.query(`select stardust from public.profiles where id = $1`, [e0])).rows[0].stardust;
check(pol === 5 && afterPolish === 20000 - 6200, `polish I–V costs 6200 in all (${20000 - afterPolish})`);
err = null; try { await db.query(`select public.polish_part($1)`, [common]); } catch (e) { err = e.message; }
check(err?.includes('fully_polished'), 'no polish past V');
err = null; try { await db.query(`select public.polish_part($1)`, [mythic === common ? 'x' : (await db.query(`select id from public.parts where id not in (select part_id from public.player_parts where player_id = $1) limit 1`, [e0])).rows[0].id]); } catch (e) { err = e.message; }
check(err?.includes('not_owned'), 'only parts you own can be polished');
for (let i = 0; i < 2; i++) await db.query(`select public.buy_plate()`);
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
check(JSON.stringify(cat) === JSON.stringify([{ rarity: 'common', n: 16 }, { rarity: 'epic', n: 10 }, { rarity: 'mythic', n: 6 }, { rarity: 'rare', n: 16 }]), 'Season 0: 16 Common, 16 Rare, 10 Epic, 6 Mythic');
await db.exec(`set role authenticated`);
err = null; try { await db.exec(`update public.player_parts set part_id = part_id`); } catch (e) { err = e.message; }
check(!!err, `players cannot write their parts (${err?.slice(0, 40)})`);
await db.exec(`reset role`);

console.log(fails.length ? `\n${fails.length} FAILED` : '\nall checks passed');
process.exit(fails.length ? 1 : 0);