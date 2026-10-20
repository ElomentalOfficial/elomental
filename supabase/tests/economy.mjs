// Replays every migration in PGlite (in-memory Postgres, no live database touched) with
// Supabase stand-ins, then exercises the economy: a part every 3rd rated solve with its
// guarantees, duplicates, the daily limit, forging with Stardust, equip, affinity choice,
// influence and standings. `npm run test:db`
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIG = fileURLToPath(new URL('../migrations', import.meta.url));
const db = new PGlite({ extensions: { pg_trgm } });

// --- Supabase stand-ins
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema extensions;
  -- stand-in for pgcrypto's gen_random_bytes (live has the real one)
  create function extensions.gen_random_bytes(n integer) returns bytea language sql volatile as $$
    select decode(string_agg(lpad(to_hex(floor(random() * 256)::int), 2, '0'), ''), 'hex') from generate_series(1, n) $$;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz, is_anonymous boolean default false,
    raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
  create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, status text not null default 'unverified',
    factor_type text default 'totp', created_at timestamptz default now());
  create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null, factor_id uuid, aal text default 'aal1');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  -- the session's assurance level: 'aal2' once an authenticator code was given (test.aal),
  -- and which session this is (test.session)
  create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object(
    'aal', coalesce(nullif(current_setting('test.aal', true), ''), 'aal1'),
    'session_id', nullif(current_setting('test.session', true), '')) $$;
`);

const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
// Just before whole_avatars, a player with the old layered parts, polish levels and Crowns,
// to check what the move to whole avatars pays back.
const AVATARS = files.find((f) => f.endsWith('_whole_avatars.sql'));
let veteran = null;
// Just before review_integrity, the data it tidies: open games left over, a founder's dev
// account with a numbered edition and influence, a balance with no ledger behind it.
const INTEGRITY = files.find((f) => f.endsWith('_review_integrity.sql'));
const old = {};
for (const f of files) {
  if (f === INTEGRITY) {
    old.stale = (await db.query(`insert into auth.users default values returning id`)).rows[0].id;
    old.dev = (await db.query(`insert into auth.users default values returning id`)).rows[0].id;
    const myth = (await db.query(`select id from public.parts where rarity = 'mythic' limit 1`)).rows[0].id;
    old.myth = myth;
    await db.exec(`
      insert into public.games (user_id, mode, difficulty, seed, rating, started_at) values
        ('${old.stale}', 'casual', 'easy', 'a', 400, now() - interval '2 hours'), ('${old.stale}', 'casual', 'easy', 'b', 400, now() - interval '1 hour');
      insert into public.clashes (code, difficulty, created_by) values ('AAAAAA', 'easy', '${old.stale}'), ('AAAAAB', 'easy', '${old.stale}'),
        ('AAAAAC', 'easy', '${old.stale}'), ('AAAAAD', 'easy', '${old.stale}');
      insert into public.games (user_id, mode, difficulty, seed, rating, clash_code, started_at)
        select '${old.stale}', 'clash', 'easy', 'clash:' || c, 400, c, now() - (n || ' minutes')::interval
        from (values ('AAAAAA', 40), ('AAAAAB', 30), ('AAAAAC', 20), ('AAAAAD', 10)) v (c, n);
      update public.profiles set dev_mode = true, stardust = 999999, affinity = 'air' where id = '${old.dev}';
      insert into public.player_parts (player_id, part_id, how, edition) values ('${old.dev}', '${myth}', 'forge', 1);
      update public.parts set editions_forged = 1 where id = '${myth}';
      insert into public.affinity_months (month, player_id, affinity, influence, solves)
        values (date_trunc('month', now())::date, '${old.dev}', 'air', 50, 10);`);
  }
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
  // as start_game does: a new Casual or Clash game closes the open one
  if (mode === 'casual' || mode === 'clash') {
    await db.query(`update public.games set finished_at = now(), won = false, seconds = 0 where user_id = $1 and mode = $2 and finished_at is null`, [uid, mode]);
  }
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
let st = (await db.query(`select * from public.affinity_standings() order by affinity`)).rows;
check(st.find((r) => r.affinity === 'water').members === 0, 'one solve: not yet a counted member');
for (let i = 0; i < 4; i++) await play(d0, 'casual', 'easy');
await as(d0);
st = (await db.query(`select * from public.affinity_standings() order by affinity`)).rows;
check(st.find((r) => r.affinity === 'water').members === 1, 'from 5 solves in the month the member counts');

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
// (the only Mythic: one of the 3 solves above may have dropped it)
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
err = null; try { await db.query(`select public.dev_set_mode(true)`); } catch (e) { err = e.message; }
check(err?.includes('not_admin'), 'a founder without the authenticator code gets nothing');
const st0 = (await db.query(`select public.founder_status() as j`)).rows[0].j;
check(st0.founder === true && st0.unlocked === false, `founder_status: a founder, not unlocked (${JSON.stringify(st0)})`);
await db.exec(`select set_config('test.aal', 'aal2', false)`);
const stNoFactor = (await db.query(`select public.founder_status() as j`)).rows[0].j;
check(stNoFactor.unlocked === false, 'a code from an authenticator that isn\'t pinned unlocks nothing');
const factor = (await db.query(`insert into auth.mfa_factors (user_id, status) values ('${fo}', 'verified') returning id`)).rows[0].id;
await db.query(`select private.pin_founder_factor('founder@example.test', $1)`, [factor]);
const sess = (await db.query(`insert into auth.sessions (user_id, factor_id, aal) values ($1, $2, 'aal2') returning id`, [fo, factor])).rows[0].id;
await db.exec(`select set_config('test.session', '${sess}', false)`);
const st1 = (await db.query(`select public.founder_status() as j`)).rows[0].j;
check(st1.unlocked === true, 'with the pinned authenticator\'s code: unlocked');
// someone who got into the account adds their own authenticator and passes its code
const rogue = (await db.query(`insert into auth.mfa_factors (user_id, status) values ('${fo}', 'verified') returning id`)).rows[0].id;
const rogueSess = (await db.query(`insert into auth.sessions (user_id, factor_id, aal) values ($1, $2, 'aal2') returning id`, [fo, rogue])).rows[0].id;
await db.exec(`select set_config('test.session', '${rogueSess}', false)`);
check((await db.query(`select public.founder_status() as j`)).rows[0].j.unlocked === false, 'H1 a session through another authenticator unlocks nothing');
err = null; try { await db.query(`select private.pin_founder_factor('founder@example.test', $1)`, [factor.replace(/.$/, (c) => (c === '0' ? '1' : '0'))]); } catch (e) { err = e.message; }
check(!!err, 'H1 only a verified authenticator of that founder can be pinned');
await db.exec(`select set_config('test.session', '${sess}', false)`);
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
const devLedger = (await db.query(`select count(*)::int n from private.ledger where player_id = $1 and reason like 'dev_%'`, [fo])).rows[0].n;
check(devLedger >= 1, `dev tools leave a ledger trail (${devLedger})`);
await db.query(`select public.dev_set_mode(false)`);
const testAcc = (await db.query(`select test_account from public.profiles where id = $1`, [fo])).rows[0].test_account;
check(testAcc === true, 'after dev mode the account stays a test account');
err = null; try { await db.query(`select public.dev_action('fill')`); } catch (e) { err = e.message; }
check(err?.includes('dev_off'), 'dev tools stop when dev mode is off');
const log = (await db.query(`select public.founder_activity(50) as j`)).rows[0].j;
check(log.length === 9 && log[0].action === 'dev_off' && log.some((r) => r.action === 'next_drop' && r.detail === 'mythic'), `every founder action is logged (${log.length}, newest ${log[0]?.action})`);
await db.exec(`select set_config('test.aal', 'aal1', false)`);
err = null; try { await db.query(`select public.founder_activity()`); } catch (e) { err = e.message; }
check(err?.includes('not_admin'), 'the log needs the code too');

// --- 11. the leaderboard
const lbPlayer = async (name, elo, extra = '') => {
  const id = (await db.query(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [`${name.toLowerCase()}@example.test`])).rows[0].id;
  await db.query(`update public.profiles set display_name = $2, elo = $3, ranked_games = 5 ${extra} where id = $1`, [id, name, elo]);
  return id;
};
const ana = await lbPlayer('Anastasia', 2400, ", affinity = 'fire', country = 'RO'");
const bob = await lbPlayer('Bogdan', 1800, ", affinity = 'water', country = 'RO'");
const cata = await lbPlayer('Catalina', 1500, ", affinity = 'fire'");
const ghost = await lbPlayer('Ghostly', 3000, ', lb_hidden = true');
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

// --- 12. the full review's integrity fixes (docs/FULL_REVIEW.md, batch B1)
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const tryq = async (sql, args = []) => { try { return { ok: (await db.query(sql, args)).rows }; } catch (e) { return { err: e.message }; } };

// C2: a Ranked loss is priced at the stored target, whatever the client says the puzzle was
const h1 = await newPlayer(), h2 = await newPlayer();
await db.query(`update public.profiles set elo = 1600, ranked_games = 30 where id in ($1, $2)`, [h1, h2]);
const lose = async (uid, rating) => {
  await as(uid);
  const g = (await one(`select public.start_game('ranked') j`)).j;
  return (await one(`select public.finish_game($1, false, 0, 0, null, $2, null) j`, [g.game_id, rating])).j.elo;
};
const l1 = await lose(h1, 1600), l2 = await lose(h2, 4000);
check(l1.after - l1.before === l2.after - l2.before && l1.after < l1.before, `C2 a forged rating doesn't soften a Ranked loss (${l1.after - l1.before} vs ${l2.after - l2.before})`);

// C1: one open Casual game and one open Clash game; Casual pays 1 after 20 solves a day
const oc = await newPlayer();
await as(oc);
await db.query(`select public.start_game('casual', 'hard')`);
await db.query(`select public.start_game('casual', 'easy')`);
for (const code of ['ABCDEF', 'ABCDEG', 'ABCDEH', 'ABCDEJ']) {
  await db.query(`select public.start_game('clash', null, null, $1)`, [code]);
  await db.exec(`update public.games set started_at = started_at - interval '1 minute' where user_id = '${oc}'`);
}
const opens = (await db.query(`select mode, count(*)::int n from public.games where user_id = $1 and finished_at is null group by mode order by mode`, [oc])).rows;
check(JSON.stringify(opens) === '[{"mode":"casual","n":1},{"mode":"clash","n":3}]', `C1 one open Casual game, at most 3 open Clash games (${JSON.stringify(opens)})`);
const back = await tryq(`select public.start_game('clash', null, null, 'ABCDEF') j`);
check(back.err?.includes('clash_played'), 'C1 the oldest clash, closed, counts as played');
const kept = await tryq(`select public.start_game('clash', null, null, 'ABCDEG') j`);
check(kept.ok?.[0]?.j?.resumed === true, 'C1 the newer clashes can still be resumed');
const grinder = await newPlayer();
const pays = [];
let lastPay = null;
for (let i = 0; i < 22; i++) { lastPay = await play(grinder, 'casual', 'medium'); pays.push(lastPay.dust); }
check(pays[19] === 8 && pays[20] === 1 && pays[21] === 1 && lastPay.dustCapped === true, `C1 Casual pays in full for 20 solves a day, then 1, and says so (${pays.slice(18).join(', ')})`);

// what the migration tidied (data from before it)
const staleOpen = (await db.query(`select mode, count(*)::int n from public.games where user_id = $1 and finished_at is null group by mode order by mode`, [old.stale])).rows;
check(JSON.stringify(staleOpen) === '[{"mode":"casual","n":1},{"mode":"clash","n":3}]', `migration: old open games closed down to 1 Casual and 3 Clash (${JSON.stringify(staleOpen)})`);
const newestKept = (await one(`select seed from public.games where user_id = $1 and mode = 'casual' and finished_at is null`, [old.stale])).seed;
check(newestKept === 'b', 'migration: the newest Casual game stays open');
const devOld = await one(`select p.test_account, (select edition from public.player_parts where player_id = p.id and part_id = $2) as edition,
  (select count(*)::int from public.affinity_months where player_id = p.id) as months from public.profiles p where p.id = $1`, [old.dev, old.myth]);
check(devOld.test_account === true && devOld.edition === null && devOld.months === 0, `migration: the dev account is a test account, without its edition or influence (${JSON.stringify(devOld)})`);
const devLedgerOld = await one(`select reason, stardust from private.ledger where player_id = $1 and ref = 'review_integrity'`, [old.dev]);
check(devLedgerOld?.reason === 'dev_adjust' && devLedgerOld.stardust === 999999, `migration: the unexplained balance gets one ledger row (${JSON.stringify(devLedgerOld)})`);
// (the accounts from before the migration: later sections set balances by hand)
const sums = await one(`select count(*)::int n from public.profiles p
  where p.id in ($1, $2, $3) and (p.stardust <> coalesce((select sum(stardust) from private.ledger where player_id = p.id), 0)
     or p.spirits <> coalesce((select sum(spirits) from private.ledger where player_id = p.id), 0))`, [old.stale, old.dev, veteran]);
check(sums.n === 0, `migration: every balance matches its ledger (${sums.n} don't)`);

// the first leaderboard call is gone; no public function is open to signed-out visitors
check(!!(await tryq(`select public.leaderboard(50)`)).err, 'the old leaderboard() call is gone');
const anonFns = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`)).rows.map((r) => r.proname);
check(anonFns.length === 0, `no public function runs for signed-out visitors (${anonFns.join(', ') || 'none'})`);

// C4: in Ranked at most 2 minutes of pauses come off the counted time
const pz = await newPlayer();
const pg = (await one(`insert into public.games (user_id, mode, difficulty, seed, rating, started_at, paused_seconds, audit)
  values ($1, 'ranked', 'medium', 's', 500, now() - interval '1200 seconds', 600, $2) returning id`, [pz, JSON.stringify({ copied: false, solution: SOLVED, rating: 500 })])).id;
await as(pz);
const pj = (await one(`select public.finish_game($1, true, 0, 0, 10, 500, $2) j`, [pg, SOLVED])).j;
check(Math.abs(pj.seconds - 1080) <= 2, `C4 Ranked time counts pauses beyond 2 minutes (${pj.seconds}s for 1200s with 600s paused)`);

// M16: the 10th solve of a day says the parts are done for today
const cap = await newPlayer();
let last = null;
for (let i = 0; i < 10; i++) last = await play(cap, 'casual', 'easy');
check(last.partsCapped === true && last.progress === null, 'M16 finish_game says when the day\'s counted solves are used up');

// H2: the founder's test account stays off every list, earns no influence and no edition
await db.exec(`select private.refresh_lb()`);
check((await one(`select count(*)::int n from private.lb where id = $1`, [fo])).n === 0, 'H2 a test account isn\'t on the leaderboard');
await as(cata);
check((await one(`select public.player_card($1) j`, [fo])).j.hidden === true, 'H2 a test account\'s card is private');
check((await tryq(`select public.follow($1)`, [fo])).err?.includes('no_player'), 'H2 a test account can\'t be followed');
await db.exec(`update public.profiles set affinity = 'fire' where id = '${fo}'`);
const foSolve = await play(fo, 'casual', 'hard');
check(!foSolve.influence, 'H2 a test account adds no influence');
await as(fo);
const myth = (await one(`select id, editions_forged from public.parts where rarity = 'mythic' limit 1`));
await db.exec(`delete from public.player_parts where player_id = '${fo}' and part_id = '${myth.id}'`);
const forged = (await one(`select public.forge_part($1) j`, [myth.id])).j;
const mythAfter = (await one(`select editions_forged from public.parts where id = $1`, [myth.id])).editions_forged;
check(forged.edition === null && mythAfter === myth.editions_forged, `H2 a test account's forge gets no numbered edition (${forged.edition}, counter ${myth.editions_forged} -> ${mythAfter})`);
await db.exec(`select set_config('test.aal', 'aal1', false)`);

// L1: hiding and restriction take effect at once, not at the next snapshot
const vv = await lbPlayer('Veronica', 900), ww = await lbPlayer('Wilhelmina', 800);
await db.exec(`select private.refresh_lb()`);
await as(vv); await db.query(`select public.set_card_privacy(true, null)`);
await as(ww);
check(!(await one(`select public.lb_page('global') j`)).j.rows.some((r) => r.name === 'Veronica'), 'L1 a hidden player leaves the list straight away');
await db.exec(`select private.restrict_ranked('Wilhelmina', 30)`);
await as(cata);
check(!(await one(`select public.lb_page('global') j`)).j.rows.some((r) => r.name === 'Wilhelmina'), 'L1 a restricted player leaves the list straight away');
await db.exec(`delete from private.search_hits`);
const wSearch = (await one(`select public.lb_search('wilhel') j`)).j;
check(wSearch.length === 1 && wSearch[0].place === null, `L1 search shows a restricted player without a place (${JSON.stringify(wSearch.map((r) => r.place))})`);

// L5: a player restricted mid-game gets no Elo for the open Ranked game; the flag queue is capped
const rr = await lbPlayer('Rosalind', 1000);
await as(rr);
const rg = (await one(`select public.start_game('ranked') j`)).j;
await db.exec(`select private.restrict_ranked('Rosalind', 30)`);
await db.query(`update public.games set audit = $2, started_at = now() - interval '600 seconds' where id = $1`, [rg.game_id, JSON.stringify({ copied: false, solution: SOLVED, rating: 1000 })]);
await as(rr);
const re = (await one(`select public.finish_game($1, true, 0, 0, null, null, $2) j`, [rg.game_id, SOLVED])).j.elo;
check(re.after === re.before && re.unrated === 'restricted', `L5 a restricted player's open Ranked win is unrated (${re.before} -> ${re.after}, ${re.unrated})`);
const flooder = await newPlayer();
for (let i = 0; i < 25; i++) await play(flooder, 'ranked', 'medium', { noAudit: true });
const flags = (await one(`select count(*)::int n from private.review_flags where user_id = $1`, [flooder])).n;
check(flags === 20, `L5 at most 20 open review flags per player (${flags})`);

// L8: flagged Ranked wins don't use up the day's counted solves
const fl = await newPlayer();
for (let i = 0; i < 9; i++) await play(fl, 'ranked', 'medium', { noAudit: true });
check((await play(fl, 'casual', 'easy')).progress !== null, 'L8 flagged wins don\'t use up the 9 counted solves');

// L3: the Founder title needs a confirmed email
await db.exec(`insert into private.founders (email) values ('later@example.test')`);
const imp = (await one(`insert into auth.users (email) values ('later@example.test') returning id`)).id;
check((await one(`select title from public.profiles where id = $1`, [imp])).title === null, 'L3 an unconfirmed sign-up gets no Founder title');
await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [imp]);
check((await one(`select title from public.profiles where id = $1`, [imp])).title === 'Founder', 'L3 confirming the email gives the title');

// L10: a filled-in Daily can't also be played
if (today > 1) {
  const md = await newPlayer();
  await db.exec(`update public.profiles set stardust = 300 where id = '${md}'`);
  await as(md);
  const openDaily = (await one(`select public.start_game('daily', null, $1) j`, [day(today - 1)])).j;
  await db.query(`select public.mend_daily($1)`, [day(today - 1)]);
  check((await tryq(`select public.start_game('daily', null, $1)`, [day(today - 1)])).err?.includes('daily_done'), 'L10 a mended day can\'t be played for a second reward');
  const closed = (await one(`select finished_at is not null as f from public.games where id = $1`, [openDaily.game_id])).f;
  check(closed === true, 'L10 filling in a day closes its open game');
} else console.log('  (skipped the mended Daily check: the 1st of the month)');

// L16: no duplicate badges in the showcase; countries from the list
await as(cata);
check((await tryq(`select public.set_showcase(array['win-2026-09-fire', 'win-2026-09-fire'])`)).err?.includes('bad_request'), 'L16 the same badge can\'t fill two showcase places');
check((await tryq(`select public.set_country('ZZ')`)).err?.includes('bad_request'), 'L16 only real countries');
await db.query(`select public.set_country('gb')`);
check((await one(`select country from public.profiles where id = $1`, [cata])).country === 'GB', 'L16 a listed country is kept');

// L4: balances can't go below zero
check(!!(await tryq(`update public.profiles set stardust = -1 where id = $1`, [cata])).err, 'L4 a negative balance is refused');

// M4: influence counts up to 300 per member; a tie pays both sides; under 5 solves isn't paid
const big = await lbPlayer('Bertrand', 1000);
const few = await lbPlayer('Felicity', 1000);
await db.exec(`insert into public.affinity_months (month, player_id, affinity, influence, solves) values
  ('2026-08-01', '${ana}', 'fire', 300, 30), ('2026-08-01', '${big}', 'water', 5000, 400),
  ('2026-08-01', '${few}', 'water', 40, 4)`);
const s8 = (await db.query(`select * from private.standings('2026-08-01') order by affinity`)).rows;
check(s8.find((r) => r.affinity === 'water').standing === s8.find((r) => r.affinity === 'fire').standing, `M4 one member's influence counts up to 300 (${s8.map((r) => `${r.affinity} ${r.standing}`).join(', ')})`);
const earth8 = s8.find((r) => r.affinity === 'earth');
check(earth8.members === 0 && Number(earth8.influence) === 0 && Number(earth8.standing) === 0, `M4 a side with nobody counted shows 0 influence (${JSON.stringify(earth8)})`);
const fewBefore = (await one(`select stardust from public.profiles where id = $1`, [few])).stardust;
await db.query(`select private.settle_faction_month('2026-08-01')`);
const fm = await one(`select winners from public.faction_months where month = '2026-08-01'`);
check(JSON.stringify(fm.winners) === '["fire","water"]', `M4 a tie: both sides win (${JSON.stringify(fm.winners)})`);
const paidBig = (await one(`select count(*)::int n from public.player_badges where player_id = $1`, [big])).n;
const fewAfter = (await one(`select stardust from public.profiles where id = $1`, [few])).stardust;
check(paidBig === 1 && fewAfter === fewBefore, `M4 winners with 5+ solves are paid; under 5 isn't (${paidBig}, ${fewAfter - fewBefore})`);

console.log(fails.length ? `\n${fails.length} FAILED` : '\nall checks passed');
process.exit(fails.length ? 1 : 0);