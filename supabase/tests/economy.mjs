// Replays every migration in PGlite (in-memory Postgres, no live database touched) with\n// Supabase stand-ins, then exercises the Phase 1 economy: drops with pity through\n// finish_game, influence, forging, refine, swap, equip, affinity choice and standings.\n// `npm run test:db`
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

// --- 1. drops, pity and pace over many games (spread over days so the cap doesn't bite)
const a = await newPlayer();
const tally = { scrap: 0, forged: 0, tempered: 0, runed: 0, starforged: 0 };
let parts = 0, dupes = 0, maxGapTempered = 0, gap = 0, pityHits = 0;
for (let i = 0; i < 600; i++) {
  if (i % 20 === 0) await db.exec(`update public.drops set created_at = created_at - interval '1 day' where player_id = '${a}'`);
  const j = await play(a, 'ranked', 'medium', { rating: 500 });
  const d = j.drop;
  if (!d) continue;
  tally[d.rarity]++;
  if (d.part) parts++;
  if (d.duplicate) dupes++;
  if (d.pity) pityHits++;
  gap = ['tempered', 'runed', 'starforged'].includes(d.rarity) ? 0 : gap + 1;
  maxGapTempered = Math.max(maxGapTempered, gap);
}
const n = Object.values(tally).reduce((x, y) => x + y, 0);
console.log('\n600 ranked solves ->', n, 'drops:', Object.entries(tally).map(([k, v]) => `${k} ${(v / n * 100).toFixed(1)}%`).join(', '));
console.log('  relic parts', parts, 'duplicates', dupes, 'pity hits', pityHits);
check(n === 600, 'every solve dropped (under the daily pace)');
check(maxGapTempered <= 9, `never more than 9 drops without Tempered+ (longest ${maxGapTempered})`);
check(tally.starforged >= 3, 'Starforged pity guarantees at least 3 in 600');

// --- 2. daily pace: 60 solves in one day
const b = await newPlayer();
let dropsToday = 0;
for (let i = 0; i < 60; i++) if ((await play(b, 'casual', 'medium')).drop) dropsToday++;
console.log('\n60 solves in one day ->', dropsToday, 'drops');
check(dropsToday >= 25 && dropsToday <= 50, 'pace: 25 full, then about 1 in 3, none after 50');

// --- 3. Casual Easy caps at Forged
const c = await newPlayer();
const easy = new Set();
for (let i = 0; i < 40; i++) easy.add((await play(c, 'casual', 'easy')).drop?.rarity);
check(![...easy].some((r) => ['tempered', 'runed', 'starforged'].includes(r)), `Casual Easy only Scrap/Forged (${[...easy].join(', ')})`);

// --- 4. losses and unrated: no drop
const lost = await play(c, 'ranked', 'medium', { won: false });
check(lost.drop === null, 'a loss drops nothing');

// --- 5. affinity: too soon, choose, influence, crest
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
console.log('  standings', st.map((r) => `${r.affinity}:${r.members}/${r.influence}/${r.standing}`).join(' '));
check(st.find((r) => r.affinity === 'water').members === 1, 'standings count the member');

// --- 6. forging, refine, swap, equip (give player A plenty of Stardust and Crowns)
await db.exec(`update public.profiles set stardust = 100000, crowns = 10 where id = '${a}'`);
await as(a);
const comps = (await db.query(`select element, rarity, qty from public.player_components where player_id = $1 order by element, rarity`, [a])).rows;
console.log('\nplayer A components:', comps.map((r) => `${r.element}.${r.rarity}=${r.qty}`).join(' '));
const forgeable = (await db.query(`
  select pt.id from public.parts pt join public.recipes r on r.part_id = pt.id
  where pt.rarity = 'forged' and not exists (select 1 from public.player_parts pp where pp.player_id = $1 and pp.part_id = pt.id)
    and (select coalesce(qty,0) from public.player_components c where c.player_id = $1 and c.element = pt.element and c.rarity = 'scrap') >= 10
    and (select coalesce(qty,0) from public.player_components c where c.player_id = $1 and c.element = pt.element and c.rarity = 'forged') >= 4
  limit 1`, [a])).rows[0]?.id;
check(!!forgeable, `a Forged part is forgeable (${forgeable})`);
if (forgeable) {
  const before = (await db.query(`select stardust from public.profiles where id = $1`, [a])).rows[0].stardust;
  await db.query(`select public.forge_part($1)`, [forgeable]);
  const after = (await db.query(`select stardust from public.profiles where id = $1`, [a])).rows[0].stardust;
  check(before - after === 80, 'forging a Forged part costs 80 Stardust');
  err = null; try { await db.query(`select public.forge_part($1)`, [forgeable]); } catch (e) { err = e.message; }
  check(err?.includes('already_owned'), 'cannot forge it twice');
  await db.query(`select public.equip_part('${forgeable.split('-')[1]}', $1)`, [forgeable]);
  const eq = (await db.query(`select * from public.avatar_loadouts where player_id = $1`, [a])).rows[0];
  check(Object.values(eq).includes(forgeable), 'equipped it');
}
err = null; try { await db.query(`select public.equip_part('sigil', 's0-sigil-fire-2')`); } catch (e) { err = e.message; }
const ownsRuned = (await db.query(`select 1 from public.player_parts where player_id = $1 and part_id = 's0-sigil-fire-2'`, [a])).rows.length;
check(ownsRuned || err?.includes('not_owned'), 'cannot equip a part you do not own');
const scrapFire = (await db.query(`select qty from public.player_components where player_id = $1 and element = 'fire' and rarity = 'scrap'`, [a])).rows[0].qty;
await db.query(`select public.refine_components('fire', 'scrap', 2)`);
const scrapAfter = (await db.query(`select qty from public.player_components where player_id = $1 and element = 'fire' and rarity = 'scrap'`, [a])).rows[0].qty;
check(scrapFire - scrapAfter === 10, 'refine x2 takes 10 Scrap');
await db.query(`select public.swap_components('fire', 'air', 'scrap', 1)`);
const ledger = (await db.query(`select reason, count(*)::int n from private.ledger where player_id = $1 group by reason order by reason`, [a])).rows;
console.log('  ledger', ledger.map((r) => `${r.reason}:${r.n}`).join(' '));
check(ledger.some((r) => r.reason === 'forge') && ledger.some((r) => r.reason === 'refine') && ledger.some((r) => r.reason === 'swap'), 'ledger records forge, refine, swap');

// --- 7. a client can't write the tables directly
await db.exec(`set role authenticated`);
err = null; try { await db.exec(`update public.player_components set qty = 999`); } catch (e) { err = e.message; }
check(!!err, `players cannot write their inventory (${err?.slice(0, 40)})`);
await db.exec(`reset role`);

console.log(fails.length ? `\n${fails.length} FAILED` : '\nall checks passed');
process.exit(fails.length ? 1 : 0);
