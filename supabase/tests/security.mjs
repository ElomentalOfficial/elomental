// The security review's proofs (docs/review/backend-security-reviewer.md), kept as regression
// checks: each describes the safe behaviour and makes its own players. The holes they found are
// closed (batches B1 and B11); a FAIL here means one has reopened.
import { as, check, db, one, setAudit, SOLVED, tryq } from './harness.mjs';

const player = async ({ email = null, confirmed = true } = {}) =>
  (await one(`insert into auth.users (email, email_confirmed_at) values ($1, $2) returning id`, [email, email && confirmed ? new Date().toISOString() : null])).id;
const backdate = (id, s) => db.query(`update public.games set started_at = now() - ($2 || ' seconds')::interval where id = $1`, [id, String(s)]);

export default async function () {
  // SEC-1: one open Casual game at a time. (Its second proof, a valid grid that isn't the
  // puzzle's own answer, needs the server to hold Casual puzzles; B11 did that for Ranked only.)
  {
    const u = await player();
    await as(u);
    await db.query(`select public.start_game('casual', 'hard')`);
    await tryq(`select public.start_game('casual', 'hard')`);
    const open = (await one(`select count(*)::int n from public.games where user_id = $1 and finished_at is null`, [u])).n;
    check(open === 1, `SEC-1 one open Casual game per player (open: ${open})`);
  }

  // SEC-2: a Ranked loss is priced at the server's rating, whatever p_rating says.
  {
    const h = await player({ email: 'sec-h@t.test' }), c = await player({ email: 'sec-c@t.test' });
    await db.query(`update public.profiles set elo = 1600, ranked_games = 30 where id in ($1, $2)`, [h, c]);
    const lose = async (uid, rating) => {
      await as(uid);
      const g = (await one(`select public.start_game('ranked') j`)).j;
      return (await one(`select public.finish_game($1, false, 0, 0, null, $2, null) j`, [g.game_id, rating])).j.elo;
    };
    const x = await lose(h, 1600), y = await lose(c, 1950);
    check(x.after - x.before === y.after - y.before, `SEC-2 a forged p_rating doesn't soften a loss (${x.after - x.before} vs ${y.after - y.before})`);
  }

  // SEC-6: a founder's dev-mode account stays off the leaderboard, and its tools leave a trail.
  {
    const fo = await player({ email: 'sec-f@t.test' });
    await db.exec(`insert into private.founders (email) values ('sec-f@t.test')`);
    await db.query(`update public.profiles set ranked_games = 1 where id = $1`, [fo]);
    // unlocked as a founder is: the pinned authenticator's code on this session
    const factor = (await one(`insert into auth.mfa_factors (user_id, status) values ($1, 'verified') returning id`, [fo])).id;
    await db.query(`select private.pin_founder_factor('sec-f@t.test', $1)`, [factor]);
    const sess = (await one(`insert into auth.sessions (user_id, factor_id, aal) values ($1, $2, 'aal2') returning id`, [fo, factor])).id;
    await as(fo);
    await db.exec(`select set_config('test.aal', 'aal2', false); select set_config('test.session', '${sess}', false)`);
    await db.query(`select public.dev_set_mode(true)`);
    await db.query(`select public.dev_action('elo', '2000')`);
    await db.exec(`select private.refresh_lb()`);
    const listed = (await one(`select count(*)::int n from private.lb where id = $1`, [fo])).n;
    check(listed === 0, `SEC-6 a dev-mode account isn't on the leaderboard (listed: ${listed})`);
    // the trail: currency tools in the ledger (it holds Stardust and Spirits), every tool in the founder log
    await db.query(`select public.dev_action('fill')`);
    const led = (await one(`select count(*)::int n from private.ledger where player_id = $1 and reason like 'dev_%'`, [fo])).n;
    const logged = (await one(`select public.founder_activity(10) j`)).j.map((r) => r.action);
    check(led > 0 && logged[0] === 'fill' && logged[1] === 'elo',`SEC-6 dev tools leave a trail (${led} ledger rows; log: ${logged.join(', ')})`);
    await db.query(`select public.dev_set_mode(false)`);
    await db.exec(`select set_config('test.aal', 'aal1', false); select set_config('test.session', '', false)`);
  }

  // Show founders to players (show_founders): off by default, founders only, and "seen, not competing".
  {
    const shownF = await player({ email: 'sec-shown@t.test' });
    await db.exec(`insert into private.founders (email) values ('sec-shown@t.test')`);
    await db.query(`update public.profiles set display_name = 'Seraphina', elo = 1700, ranked_games = 5, affinity = 'air', test_account = true where id = $1`, [shownF]);
    const viewer = await player({ email: 'sec-viewer@t.test' });
    await db.query(`update public.profiles set display_name = 'Viewer', elo = 900, ranked_games = 3 where id = $1`, [viewer]);
    await db.exec(`select private.refresh_lb()`);
    const seen = async () => {
      await as(viewer);
      await db.exec(`delete from private.search_hits`);
      return {
        listed: (await one(`select public.lb_page('global') j`)).j.rows.some((r) => r.name === 'Seraphina'),
        found: (await one(`select public.lb_search('seraph') j`)).j.length === 1,
        card: !(await one(`select public.player_card($1) j`, [shownF])).j.hidden,
        follow: !(await tryq(`select public.follow($1)`, [shownF])).err,
      };
    };
    const off = await seen();
    check(!off.listed && !off.found && !off.card && !off.follow, `founders hidden by default (${JSON.stringify(off)})`);
    await as(viewer);
    check((await tryq(`select public.dev_show_founders(true)`)).err?.includes('not_admin'), 'only a founder with their code can show founders');
    const anonCan = (await one(`select has_function_privilege('anon', 'public.dev_show_founders(boolean)', 'execute') a, has_function_privilege('anon', 'public.founders_shown()', 'execute') b`));
    check(!anonCan.a && !anonCan.b, "signed-out visitors can't call the switch or read it");
    // the founder, unlocked as founders are
    const factor = (await one(`insert into auth.mfa_factors (user_id, status) values ($1, 'verified') returning id`, [shownF])).id;
    await db.query(`select private.pin_founder_factor('sec-shown@t.test', $1)`, [factor]);
    const sess = (await one(`insert into auth.sessions (user_id, factor_id, aal) values ($1, $2, 'aal2') returning id`, [shownF, factor])).id;
    await as(shownF);
    await db.exec(`select set_config('test.aal', 'aal2', false); select set_config('test.session', '${sess}', false)`);
    check((await one(`select public.founders_shown() s`)).s === false, 'the switch starts off');
    await db.query(`select public.dev_show_founders(true)`);
    check((await one(`select public.founders_shown() s`)).s === true, 'a founder turns it on');
    // a solve while shown still adds no influence
    const g = (await one(`insert into public.games (user_id, mode, difficulty, seed, rating, started_at) values ($1, 'casual', 'easy', 's', 100, now() - interval '600 seconds') returning id`, [shownF])).id;
    const win = (await one(`select public.finish_game($1, true, 0, 0, 600, 100, $2) j`, [g, SOLVED])).j;
    await db.exec(`select set_config('test.aal', 'aal1', false); select set_config('test.session', '', false)`);
    const on = await seen();
    check(on.listed && on.found && on.card && on.follow, `shown founders are on the list, in search, on cards and followable (${JSON.stringify(on)})`);
    check(!win.influence, 'a shown founder still earns no influence');
    await as(shownF);
    await db.exec(`select set_config('test.aal', 'aal2', false); select set_config('test.session', '${sess}', false)`);
    await db.query(`select public.dev_show_founders(false)`);
    const log = (await one(`select public.founder_activity(5) j`)).j.map((r) => r.action);
    check(log[0] === 'hide_founders' && log[1] === 'show_founders', `the switch is in the founder log (${log.slice(0, 2).join(', ')})`);
    await db.exec(`select set_config('test.aal', 'aal1', false); select set_config('test.session', '', false)`);
    const again = await seen();
    check(!again.listed && !again.found && !again.card, `turned off, founders leave the lists at once (${JSON.stringify(again)})`);
  }

  // SEC-7: hiding takes effect at once, not at the next snapshot.
  {
    const v = await player({ email: 'sec-v@t.test' }), w = await player({ email: 'sec-w@t.test' });
    await db.query(`update public.profiles set display_name = 'Valentina', elo = 900, ranked_games = 3 where id = $1`, [v]);
    await db.query(`update public.profiles set elo = 800, ranked_games = 3 where id = $1`, [w]);
    await db.exec(`select private.refresh_lb()`);
    await as(v);
    await db.query(`select public.set_card_privacy(true, null)`);
    await as(w);
    const shown = (await one(`select public.lb_page('global') j`)).j.rows.some((r) => r.name === 'Valentina');
    check(!shown, 'SEC-7 a hidden player leaves the list straight away');
  }

  // SEC-10: the Founder title needs a confirmed email.
  {
    await db.exec(`insert into private.founders (email) values ('sec-later@t.test')`);
    const imp = await player({ email: 'sec-later@t.test', confirmed: false });
    const t = (await one(`select title from public.profiles where id = $1`, [imp])).title;
    check(t === null, `SEC-10 an unconfirmed sign-up gets no Founder title (${t})`);
  }

  // No private function runs for a player: finish_game's stages and every other helper.
  {
    const open = (await one(`select count(*)::int n from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
      where n.nspname = 'private' and (has_function_privilege('authenticated', pr.oid, 'execute') or has_function_privilege('anon', pr.oid, 'execute'))`)).n;
    check(open === 0, `private functions are closed to players (${open} open)`);
  }

  // SEC-12: a player restricted mid-game gets no Elo for the open Ranked game.
  {
    const r = await player({ email: 'sec-r@t.test' });
    await db.query(`update public.profiles set display_name = 'Rowena', elo = 1000, ranked_games = 3 where id = $1`, [r]);
    await as(r);
    const g = (await one(`select public.start_game('ranked') j`)).j;
    await db.exec(`select private.restrict_ranked('Rowena', 30)`);
    await setAudit(g.game_id, { copied: false, solution: SOLVED, rating: 1000 });
    await backdate(g.game_id, 600);
    await as(r);
    const e = (await one(`select public.finish_game($1, true, 0, 0, null, null, $2) j`, [g.game_id, SOLVED])).j.elo;
    check(e.after === e.before, `SEC-12 a restricted player's open Ranked win is unrated (${e.before} -> ${e.after})`);
  }
}
