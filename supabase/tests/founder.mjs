// Founders: the authenticator gate and dev mode.
import { db, as, check, newPlayer, one, play, players, tryq } from './harness.mjs';

export default async function () {
  let err = null;
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
  check(all === 27, `unlock every part (${all})`);
  await db.query(`select public.dev_action('elo', '1500')`);
  await db.query(`select public.dev_action('level', '100')`);
  const set = (await db.query(`select elo, rank_tier, plate, xp from public.profiles where id = $1`, [fo])).rows[0];
  check(set.elo === 1500 && set.rank_tier === 4 && set.xp === 99000 && set.plate === 9,
    `set Elo (and its rank), and a level (its XP, its newest plate: 9 at level 100) (${JSON.stringify(set)})`);
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
  await db.exec(`select set_config('test.aal', 'aal2', false)`);

  // --- 11. live: no dev tools (the dev_tools flag off), Review only
  await db.query(`select public.dev_set_mode(true)`);
  await db.exec(`update private.app_flags set enabled = false where name = 'dev_tools'`);
  check((await one(`select private.dev_on($1) d`, [fo])).d === false, 'live: dev mode that was on does nothing');
  check((await tryq(`select public.dev_action('fill')`)).err?.includes('dev_off'), 'live: the dev tools are refused');
  check((await tryq(`select public.dev_set_mode(true)`)).err?.includes('beta_only'), 'live: dev mode can\'t be turned on');
  check(!!(await tryq(`select public.dev_set_mode(false)`)).ok, 'live: dev mode can still be turned off');
  check((await tryq(`select public.dev_show_founders(true)`)).err?.includes('beta_only'), 'live: Show founders can\'t be changed');
  check((await tryq(`select public.beta_tester_add('x@example.test')`)).err?.includes('beta_only'), 'live: no tester list');
  await db.exec(`update private.app_flags set enabled = true where name = 'dev_tools'`);

  // --- 12. beta testers: only listed emails (and founders) get an account
  const hook = async (email) => (await one(`select public.hook_before_user_created($1::jsonb) j`, [JSON.stringify({ user: { email } })])).j;
  check((await hook('stranger@example.test')).error?.message === 'not_a_tester', 'hook: an email not on the list is refused');
  check((await hook(null)).error?.http_code === 403, 'hook: a guest (no email) is refused');
  check(JSON.stringify(await hook('Founder@Example.test')) === '{}', 'hook: a founder always gets in');
  check((await tryq(`select public.beta_tester_add('not an email')`)).err?.includes('bad_email'), 'add: refuses what isn\'t an email');
  await db.query(`select public.beta_tester_add('  Tester@Example.TEST ')`);
  check(JSON.stringify(await hook('tester@example.test')) === '{}', 'hook: a tester gets in (any case, trimmed)');
  const testerId = (await one(`insert into auth.users (email, email_confirmed_at) values ('tester@example.test', now()) returning id`)).id;
  const list = (await one(`select public.beta_testers() j`)).j;
  check(list.length === 1 && list[0].email === 'tester@example.test', `the list shows the tester (${JSON.stringify(list)})`);
  await db.query(`select public.beta_tester_remove('tester@example.test')`);
  check((await one(`select count(*)::int n from auth.users where id = $1`, [testerId])).n === 0, 'remove: their beta account goes');
  check((await hook('tester@example.test')).error?.message === 'not_a_tester', 'remove: and they can\'t sign up again');
  await db.query(`select public.beta_tester_add('founder@example.test')`);
  await db.query(`select public.beta_tester_remove('founder@example.test')`);
  check((await one(`select count(*)::int n from auth.users where id = $1`, [fo])).n === 1, 'remove: a founder\'s account never goes');
  const actions = (await db.query(`select action from private.founder_log where action like 'tester_%'`)).rows.map((r) => r.action);
  check(actions.length === 4, `adding and removing testers is logged (${actions.join(', ')})`);
  // every session: the account's current email must be a tester's or a founder's
  const token = async (uid) => (await one(`select public.hook_beta_access_token($1::jsonb) j`, [JSON.stringify({ user_id: uid, claims: { sub: uid, role: 'authenticated' } })])).j;
  const guest = (await one(`insert into auth.users (is_anonymous) values (true) returning id`)).id;
  check((await token(guest)).error?.message === 'not_a_tester', 'session: a guest gets no session on beta');
  check((await token(fo)).claims?.sub === fo, 'session: a founder keeps their claims');
  await db.query(`select public.beta_tester_add('kept@example.test')`);
  const kept = (await one(`insert into auth.users (email, email_confirmed_at) values ('kept@example.test', now()) returning id`)).id;
  check(!!(await token(kept)).claims, 'session: a tester gets one');
  await db.query(`update auth.users set email = 'elsewhere@example.test' where id = $1`, [kept]);
  check((await token(kept)).error?.message === 'not_a_tester', 'session: a tester who changed their email to an unlisted one is out');
  await db.exec(`update private.app_flags set enabled = false where name = 'dev_tools'`);
  check((await token(guest)).claims?.sub === guest, 'live: the session hook passes everyone');
  check(JSON.stringify(await hook('stranger@example.test')) === '{}', 'live: the sign-up hook passes everyone');
  await db.exec(`update private.app_flags set enabled = true where name = 'dev_tools'`);
  check((await one(`select has_function_privilege('authenticated', 'public.hook_beta_access_token(jsonb)', 'execute') a`)).a === false, 'players can\'t call the session hook');
  await as(plain);
  check((await tryq(`select public.beta_testers()`)).err?.includes('not_admin'), 'players can\'t see the list');
  check((await one(`select has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'execute') a`)).a === false, 'players can\'t call the hook');
  await as(fo);
  await db.query(`select public.dev_set_mode(false)`);
  await db.exec(`select set_config('test.aal', 'aal1', false)`);
  Object.assign(players, { fo });
}
