// Daily reminders (migration daily_reminders): a player's own settings and devices, who is due at
// their hour in their time zone, once a day, not after today's Daily is solved, and the email's
// turn-off link.
import { db, as, check, newPlayer, one } from './harness.mjs';

export default async function () {
  const p = await newPlayer();
  await db.query(`update auth.users set email = 'p@example.com' where id = $1`, [p]);
  await as(p);
  const err = (sql, args) => db.query(sql, args).then(() => null, (e) => e.message);
  // a real-shaped subscription: a P-256 key (87 chars) and a 16-byte secret (22), base64url
  const KEY = 'B'.repeat(87);
  const AUTH = 'a'.repeat(22);
  const FCM = 'https://fcm.googleapis.com/fcm/send/abc';

  // an address nobody confirmed can't get email
  check(String(await err(`select public.reminder_set(9, 'UTC', false, true)`)).includes('no_email'), 'an unconfirmed address can\'t turn on email');
  check((await one(`select public.reminder_get() j`)).j.emailOk === false, 'an unconfirmed address: no email offered');
  await db.exec(`reset role`);
  await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [p]);
  await as(p);

  check(String(await err(`select public.reminder_set(25, 'UTC', true, false)`)).includes('bad_request'), 'an hour past 23 is refused');
  check(String(await err(`select public.reminder_set(9, 'Mars/Olympus', true, false)`)).includes('bad_request'), 'an unknown time zone is refused');

  // due right now: this hour in UTC
  const hour = (await one(`select extract(hour from now() at time zone 'UTC')::int h`)).h;
  const set = (await one(`select public.reminder_set($1, 'UTC', true, true) j`, [hour])).j;
  check(set.hour === hour && set.push && set.email && set.emailOk && set.devices === 0, `the reminder is kept (${JSON.stringify(set)})`);
  for (const bad of ['https://evil.example/x', 'https://127.0.0.1/x', 'http://fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.example/x']) {
    check(String(await err(`select public.push_subscribe($1, $2, $3)`, [bad, KEY, AUTH])).includes('bad_request'), `push only to a known push service (${bad} refused)`);
  }
  check(String(await err(`select public.push_subscribe($1, '', $2)`, [FCM, AUTH])).includes('bad_request'), 'push needs a real key');
  await db.query(`select public.push_subscribe($1, $2, $3)`, [FCM, KEY, AUTH]);
  check((await one(`select public.reminder_get() j`)).j.devices === 1, 'the device is counted');

  // a guest has no email to send to
  const g = await newPlayer();
  await db.query(`update auth.users set is_anonymous = true where id = $1`, [g]);
  await as(g);
  check(String(await err(`select public.reminder_set(9, 'UTC', false, true)`)).includes('no_email'), 'a guest can\'t turn on email');
  const none = (await one(`select public.reminder_get() j`)).j;
  check(none.hour === null && !none.push && !none.email && none.emailOk === false, `no reminder yet: all off, no email (${JSON.stringify(none)})`);

  // players can't see the tables, or take the due list
  await as(p);
  await db.exec(`set role authenticated`);
  check(!!(await err(`select * from private.reminders`)), 'players can\'t read the reminders table');
  check(!!(await err(`select public.reminders_take()`)), 'players can\'t take the due list');
  check(!!(await err(`select public.reminder_email_off(gen_random_uuid())`)), 'players can\'t use the turn-off function');
  await db.exec(`reset role`);
  const take = async () => (await one(`select public.reminders_take() j`)).j;
  const first = await take();
  const mine = first.find((r) => r.player === p);
  check(!!mine && mine.email === 'p@example.com' && mine.push.length === 1 && mine.push[0].endpoint === FCM,
    `due at their hour, with their email and device (${JSON.stringify(mine)})`);
  check(!(await take()).some((r) => r.player === p), 'sent once a day: a second take that hour has nothing for them');

  // a time zone the database doesn't know (written straight in) is skipped, not an error for all
  const odd = await newPlayer();
  await db.query(`insert into private.reminders (player_id, hour, tz, push) values ($1, $2, 'Gone/Nowhere', true)`, [odd, hour]);
  await db.query(`update private.reminders set last_sent = null where player_id = $1`, [p]);
  const withOdd = await take();
  check(withOdd.some((r) => r.player === p) && !withOdd.some((r) => r.player === odd), 'an unknown stored time zone is skipped, the rest are sent');

  // half-hour zones: due at their own hour, on their own day
  const ind = await newPlayer();
  const indHour = (await one(`select extract(hour from now() at time zone 'Asia/Kolkata')::int h`)).h;
  await db.query(`insert into private.reminders (player_id, hour, tz, email) values ($1, $2, 'Asia/Kolkata', true)`, [ind, indHour]);
  check((await take()).some((r) => r.player === ind), 'a half-hour time zone is due at its own hour');
  const indDay = await one(`select last_sent = (now() at time zone 'Asia/Kolkata' - interval '3 hours')::date ok from private.reminders where player_id = $1`, [ind]);
  check(indDay.ok === true, 'marked sent on their own day (the Daily turns at 3 AM local)');

  // a solved Daily today means no reminder
  await db.query(`update private.reminders set last_sent = null where player_id = $1`, [p]);
  await db.query(`insert into public.games (user_id, mode, difficulty, seed, rating, started_at, finished_at, won, date_key)
    values ($1, 'daily', 'medium', 'd', 400, now(), now(), true, (now() at time zone 'UTC' - interval '3 hours')::date)`, [p]);
  check(!(await take()).some((r) => r.player === p), 'today\'s Daily solved: no reminder');

  // the email's link turns email off, push stays
  const token = (await one(`select off_token from private.reminders where player_id = $1`, [p])).off_token;
  check((await one(`select public.reminder_email_off($1) ok`, [token])).ok === true, 'the turn-off link works');
  const after = await one(`select push, email from private.reminders where player_id = $1`, [p]);
  check(after.push === true && after.email === false, `email off, push kept (${JSON.stringify(after)})`);

  // both off clears the reminder and the devices
  await as(p);
  await db.query(`select public.reminder_set(9, 'UTC', false, false)`);
  await db.exec(`reset role`);
  const left = await one(`select (select count(*)::int from private.reminders where player_id = $1) r, (select count(*)::int from private.push_subscriptions where player_id = $1) s`, [p]);
  check(left.r === 0 && left.s === 0, `both off: nothing kept (${JSON.stringify(left)})`);
}
