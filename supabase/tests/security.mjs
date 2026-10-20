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
    await db.query(`select public.dev_action('elo', '4800')`);
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
