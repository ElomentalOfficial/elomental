// The shared set-up for the database tests (run.mjs): replays every migration in PGlite
// (in-memory Postgres, no live database touched) with Supabase stand-ins, then gives the areas
// their helpers. Areas run in one database, in order; `players` holds the few players a later
// area reuses from an earlier one.
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIG = fileURLToPath(new URL('../migrations', import.meta.url));
export const db = new PGlite({ extensions: { pg_trgm } });

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
export let veteran = null;
// Just before review_integrity, the data it tidies: open games left over, a founder's dev
// account with a numbered edition and influence, a balance with no ledger behind it.
const INTEGRITY = files.find((f) => f.endsWith('_review_integrity.sql'));
export const old = {};
// Just before ranked_ladder, players on the old scale (and a Ranked game each), to check the map.
const LADDER = files.find((f) => f.endsWith('_ranked_ladder.sql'));
old.ladder = [];
// Just before diamond_plate, a player holding Starforged (then plate 4), to check they keep it.
const DIAMOND = files.find((f) => f.endsWith('_diamond_plate.sql'));
// Just before account_level, a player with a past Medium Casual win and a Ranked loss, to check
// the backfill pays the win (20 XP) and not the loss.
const LEVEL = files.find((f) => f.endsWith('_account_level.sql'));
for (const f of files) {
  if (f === LEVEL) {
    old.veteranXp = (await db.query(`insert into auth.users default values returning id`)).rows[0].id;
    await db.query(`insert into public.games (user_id, mode, difficulty, seed, rating, started_at, finished_at, won) values
      ($1, 'casual', 'medium', 's', 400, now() - interval '2 days', now() - interval '2 days' + interval '10 minutes', true),
      ($1, 'ranked', 'hard', 's', 400, now() - interval '1 day', now() - interval '1 day' + interval '10 minutes', false)`, [old.veteranXp]);
  }
  if (f === DIAMOND) {
    old.starforged = (await db.query(`insert into auth.users default values returning id`)).rows[0].id;
    await db.query(`update public.profiles set plate = 4 where id = $1`, [old.starforged]);
  }
  if (f === LADDER) {
    for (const elo of [100, 300, 600, 1200, 2000, 3000, 4800]) {
      const id = (await db.query(`insert into auth.users default values returning id`)).rows[0].id;
      await db.query(`update public.profiles set elo = $2, ranked_games = 1 where id = $1`, [id, elo]);
      await db.query(`insert into public.games (user_id, mode, difficulty, seed, rating, started_at, finished_at, won, elo_before, elo_after)
        values ($1, 'ranked', 'hard', 's', 400, now() - interval '1 hour', now(), true, $2, $2 + 10)`, [id, elo - 10]);
      old.ladder.push({ id, elo });
    }
  }
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

export const SOLVED = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
export const as = (uid) => db.exec(`select set_config('test.uid', '${uid}', false)`);
export async function newPlayer() {
  const { rows } = await db.query(`insert into auth.users default values returning id`);
  return rows[0].id;
}
// A Ranked game's solve audit, as audit-solve saves it (private.game_audits since ranked_integrity).
export const setAudit = (game, audit) => db.query(`insert into private.game_audits (game_id, audit) values ($1, $2)`, [game, JSON.stringify(audit)]);
export async function play(uid, mode, difficulty, opts = {}) {
  const rating = opts.rating ?? 400;
  // as start_game does: a new Casual or Clash game closes the open one
  if (mode === 'casual' || mode === 'clash') {
    await db.query(`update public.games set finished_at = now(), won = false, seconds = 0 where user_id = $1 and mode = $2 and finished_at is null`, [uid, mode]);
  }
  const { rows } = await db.query(
    `insert into public.games (user_id, mode, difficulty, seed, rating, started_at, date_key)
     values ($1, $2, $3, 's', $4, now() - ($6 || ' seconds')::interval, $5) returning id`,
    [uid, mode, difficulty, rating, mode === 'daily' ? opts.date : null, opts.instant ? '2' : '1200']);
  if (mode === 'ranked' && !opts.noAudit) await setAudit(rows[0].id, { copied: false, solution: SOLVED, rating });
  await as(uid);
  const r = await db.query(`select public.finish_game($1, $2, $3, $4, $7, $5, $6) as j`,
    [rows[0].id, opts.won ?? true, opts.mistakes ?? 0, opts.hints ?? 0, rating, SOLVED, opts.instant ? 2 : 1200]);
  return r.rows[0].j;
}
export const fails = [];
export const check = (ok, what) => { console.log(ok ? '  ok ' : '  FAIL', what); if (!ok) fails.push(what); };

// one row, or an error message instead of a throw
export const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
export const tryq = async (sql, args = []) => { try { return { ok: (await db.query(sql, args)).rows }; } catch (e) { return { err: e.message }; } };
// a confirmed player with a name and an Elo, listed on the leaderboard after the next refresh
export const lbPlayer = async (name, elo, extra = '') => {
  const id = (await db.query(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [`${name.toLowerCase()}@example.test`])).rows[0].id;
  await db.query(`update public.profiles set display_name = $2, elo = $3, ranked_games = 5 ${extra} where id = $1`, [id, name, elo]);
  return id;
};
// this month's days, as the Daily and the mends use them
export const ym = new Date();
export const day = (n) => `${ym.getUTCFullYear()}-${String(ym.getUTCMonth() + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
export const today = ym.getUTCDate();
/** Players an earlier area made and a later one reuses (see each area). */
export const players = {};
