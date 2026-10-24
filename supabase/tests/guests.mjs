// Idle guests (migration launch_housekeeping): anonymous accounts quiet for 30 days are deleted
// with their things; anyone active, signed up or in a clash is kept, and what they shared stays.
import { db, check, newPlayer, one } from './harness.mjs';

export default async function () {
  const guest = async (lastSeenDays) => {
    const id = await newPlayer();
    await db.query(`update auth.users set is_anonymous = true, created_at = now() - ($2 || ' days')::interval,
      last_sign_in_at = now() - ($2 || ' days')::interval where id = $1`, [id, lastSeenDays]);
    return id;
  };
  const exists = async (id) => (await one(`select count(*)::int n from auth.users where id = $1`, [id])).n === 1;

  const idle = await guest(40);
  await db.query(`insert into public.games (user_id, mode, difficulty, seed, rating, started_at, finished_at, won)
    values ($1, 'casual', 'easy', 's', 400, now() - interval '40 days', now() - interval '40 days', true)`, [idle]);
  const square = (await one(`insert into public.squares (code, givens, difficulty, created_by)
    values ('GHSTQRW2', repeat('0', 81), 'easy', $1) returning code`, [idle])).code;

  const fresh = await guest(5);
  // signed in 40 days ago, but their session was refreshed yesterday: still playing
  const refreshed = await guest(40);
  await db.query(`insert into auth.sessions (user_id, created_at, updated_at, refreshed_at)
    values ($1, now() - interval '40 days', now() - interval '1 day', (now() - interval '1 day') at time zone 'UTC')`, [refreshed]);
  // signed in 40 days ago, last game a week ago
  const player = await guest(40);
  await db.query(`insert into public.games (user_id, mode, difficulty, seed, rating, started_at)
    values ($1, 'casual', 'easy', 's', 400, now() - interval '7 days')`, [player]);
  // idle, but played a clash a friend may look back on
  const clasher = await guest(40);
  await db.query(`insert into public.clashes (code, difficulty, created_by) values ('GHSTQR', 'easy', $1)`, [clasher]);
  await db.query(`insert into public.games (user_id, mode, difficulty, seed, rating, clash_code, started_at)
    values ($1, 'clash', 'easy', 'clash:GHSTQR', 400, 'GHSTQR', now() - interval '40 days')`, [clasher]);
  // idle, but placed in a season (history), gave influence last month (maybe not settled yet),
  // or carries a review flag (evidence)
  const placed = await guest(40);
  const season = (await one(`select id from public.seasons order by id limit 1`)).id;
  await db.query(`insert into public.season_results (season_id, player_id, final_elo, elo_after, games) values ($1, $2, 900, 400, 12)`, [season, placed]);
  const helper = await guest(40);
  await db.query(`insert into public.affinity_months (month, player_id, affinity, influence, solves)
    values (date_trunc('month', now() - interval '1 month')::date, $1, 'fire', 30, 5)`, [helper]);
  const flagged = await guest(40);
  await db.query(`insert into private.review_flags (user_id, reason) values ($1, 'too_quick')`, [flagged]);
  // a real (email) account, idle just as long
  const member = await newPlayer();
  await db.query(`update auth.users set created_at = now() - interval '90 days', last_sign_in_at = now() - interval '90 days' where id = $1`, [member]);

  const gone = (await one(`select private.delete_idle_guests() n`)).n;
  check(gone >= 1 && !(await exists(idle)), `an idle guest is deleted (${gone} this run)`);
  check((await one(`select count(*)::int n from public.games where user_id = $1`, [idle])).n === 0, 'their games go with them');
  check((await one(`select created_by from public.squares where code = $1`, [square])).created_by === null, 'a square code they made stays, unowned');
  check(await exists(fresh), 'a guest seen 5 days ago stays');
  check(await exists(refreshed), 'a guest whose session was refreshed yesterday stays');
  check(await exists(player), 'a guest who played a week ago stays');
  check(await exists(clasher), 'a guest who played a clash stays');
  check(await exists(member), 'an email account is never touched');
  check(await exists(placed), 'a guest in a season\'s results stays (history)');
  check(await exists(helper), 'a guest who gave influence last month stays until it\'s settled');
  check(await exists(flagged), 'a guest with a review flag stays (evidence)');

  // batches: the limit holds
  const many = [];
  for (let i = 0; i < 3; i++) many.push(await guest(60));
  check((await one(`select private.delete_idle_guests(2) n`)).n === 2, 'a run deletes at most its limit');
  check((await one(`select private.delete_idle_guests(2) n`)).n === 1, 'the next run takes the rest');
}
