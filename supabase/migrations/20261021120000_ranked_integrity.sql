-- Full review, batch B11 (docs/FULL_REVIEW.md C2 wins, C3, M1, L2; the owner chose Ranked only,
-- 2026-10-20: Casual, Daily and Clash stay on the caps from review_integrity):
--
-- * C2, C3  The Ranked audit (audit-solve) regenerates the puzzle this game dealt, from the
--       server's seed and target, and checks the solved one is it; checks the moves' timing
--       against the server clock and human pace; runs once per game (audit_slot, before any
--       work); and its verdict now lives in private.game_audits, where the player can't read it.
--       finish_game reads it from there, and a rated win needs a fifth of par on the server's own
--       clock (a bot can fake its move times, not that). C3 is narrowed, not closed: a bot that
--       plays at a human pace still passes until moves are recorded on the server.
-- * M1  A rate limit: 20 game starts and 10 new square codes a minute per player (private.hit);
--       old counts are cleared hourly.
-- * L2  The unused sign-in hand-off goes: its table, with its 32 expired rows of emails. (The
--       handoff Edge Function is deleted in the dashboard.)
--
-- Data: games.audit (22 rows) is copied to private.game_audits, then the column is dropped;
-- public.signin_handoffs is dropped. Nobody's Elo, Stardust or parts change. Undo: a later
-- migration adding games.audit back from private.game_audits and restoring finish_game,
-- start_game and square_code; the hand-off rows can't come back (by design).

-- ---------------------------------------------------------------- the audit, private
create table private.game_audits (
  game_id uuid primary key references public.games (id) on delete cascade,
  audit jsonb not null,
  at timestamptz not null default now()
);
alter table private.game_audits enable row level security;
revoke all on private.game_audits from public, anon, authenticated;
insert into private.game_audits (game_id, audit, at)
  select id, audit, coalesce(finished_at, started_at) from public.games where audit is not null;
alter table public.games drop column audit;

-- audit-solve (service role only) saves an open Ranked game's audit, once.
create function public.save_audit(p_game uuid, p_audit jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.games where id = p_game and mode = 'ranked' and finished_at is null) then
    raise exception 'not_open';
  end if;
  insert into private.game_audits (game_id, audit) values (p_game, p_audit) on conflict do nothing;
  if not found then raise exception 'already_audited'; end if;
end;
$$;
revoke execute on function public.save_audit(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_audit(uuid, jsonb) to service_role;

-- Asked first, before audit-solve does any work: may this game still be audited? 10 tries a
-- minute per player, so an audited game can't be used to burn the function's CPU.
create function public.audit_slot(p_game uuid, p_user uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.hit('audit:' || p_user, 10);
  return not exists (select 1 from private.game_audits where game_id = p_game);
end;
$$;
revoke execute on function public.audit_slot(uuid, uuid) from public, anon, authenticated;
grant execute on function public.audit_slot(uuid, uuid) to service_role;

-- The review queue says why for the new checks too.
create or replace view private.review_queue as
  select to_char(f.created_at at time zone 'utc', 'YYYY-MM-DD HH24:MI') || ' UTC' as "when",
    p.display_name as player,
    coalesce(nullif(u.email::text, ''), 'guest') as email,
    case
      when f.reason = 'unchecked' then 'Not checked'
      when f.reason = 'too_quick' or f.audit ->> 'check' in ('puzzle', 'timing') then 'Likely scripted'
      when (f.audit ->> 'potential')::numeric > 0 and (f.audit ->> 'evidence')::numeric < 0 then 'Very likely copied'
      else 'Likely copied'
    end as verdict,
    case
      when f.reason = 'unchecked' then 'The app never sent its moves for checking, usually a dropped connection. One on its own means little.'
      when f.reason = 'too_quick' then 'Solved faster than a fifth of par on the server''s clock.'
      when f.audit ->> 'check' = 'puzzle' then 'The square it solved was not the one this game dealt.'
      when f.audit ->> 'check' = 'timing' then 'The moves came faster than a person places numbers, or after the game''s own clock.'
      when f.audit ->> 'solution' is null then 'The puzzle it reported was not a valid Sudoku.'
      else format('%s of %s squares were filled in before they could be worked out.', f.audit ->> 'leaps', f.audit ->> 'placements')
    end as why,
    g.rating as puzzle_rating,
    g.seconds as seconds_taken,
    f.reviewed,
    f.note,
    f.id as flag_id,
    f.game_id
  from private.review_flags f
  join public.profiles p on p.id = f.user_id
  left join auth.users u on u.id = f.user_id
  left join public.games g on g.id = f.game_id
  order by f.reviewed, f.created_at desc;

-- The founders' Review screen says which check flagged a game (as in review_log).
create or replace function private.review_player(p_user uuid, p_open_only boolean) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'userId', p.id,
    'name', p.display_name,
    'email', nullif(u.email, ''),
    'elo', p.elo,
    'restricted', r.user_id is not null,
    'restrictedUntil', r.until,
    'restrictionReason', r.reason,
    'toReview', (select count(*) from private.review_flags f where f.user_id = p.id and not f.reviewed),
    'flagged', (select count(*) from private.review_flags f where f.user_id = p.id),
    'decisions', (select count(*) from private.moderation_log l where l.user_id = p.id),
    'lastDecision', (
      select json_build_object('action', l.action, 'days', l.days, 'note', l.note, 'at', l.created_at)
      from private.moderation_log l where l.user_id = p.id order by l.created_at desc limit 1
    ),
    'games', coalesce((
      select json_agg(x.game order by x.at desc) from (
        select f.created_at as at, json_build_object(
          'flagId', f.id,
          'at', f.created_at,
          'reason', f.reason,
          'leaps', (f.audit ->> 'leaps')::int,
          'placements', (f.audit ->> 'placements')::int,
          'evidence', (f.audit ->> 'evidence')::numeric,
          'potential', (f.audit ->> 'potential')::numeric,
          'validPuzzle', f.audit ->> 'solution' is not null,
          -- which check flagged it: 'solve' (the replay), 'puzzle', 'timing' (ranked_integrity)
          'check', f.audit ->> 'check',
          'rating', g.rating,
          'seconds', g.seconds,
          'reviewed', f.reviewed,
          'note', f.note
        ) as game
        from private.review_flags f left join public.games g on g.id = f.game_id
        where f.user_id = p.id and (not p_open_only or not f.reviewed)
        order by f.created_at desc limit 20
      ) x
    ), '[]'::json)
  )
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join private.ranked_restrictions r on r.user_id = p.id and (r.until is null or r.until > now())
  where p.id = p_user;
$$;

-- ---------------------------------------------------------------- rate limits
create table private.rate_hits (
  key text not null,
  minute timestamptz not null,
  n integer not null default 1,
  primary key (key, minute)
);
alter table private.rate_hits enable row level security;
revoke all on private.rate_hits from public, anon, authenticated;

-- One more hit on `key` this minute; refused past p_per_minute.
create function private.hit(p_key text, p_per_minute integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v integer;
begin
  insert into private.rate_hits (key, minute) values (p_key, date_trunc('minute', now()))
    on conflict (key, minute) do update set n = private.rate_hits.n + 1
    returning n into v;
  if v > p_per_minute then raise exception 'slow_down'; end if;
end;
$$;

do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('rate-hits-clean', '17 * * * *', $$delete from private.rate_hits where minute < now() - interval '1 hour'$$);
  end if;
end;
$do$;

-- ---------------------------------------------------------------- square codes: limited
create or replace function public.square_code(p_givens text, p_difficulty text, p_rating integer default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  i integer;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_givens !~ '^[0-9]{81}$' or length(replace(p_givens, '0', '')) < 17 then raise exception 'bad_square'; end if;
  if p_difficulty not in ('easy', 'medium', 'hard') then raise exception 'bad_square'; end if;

  select code into v_code from public.squares where givens = p_givens;
  if found then return v_code; end if;

  -- new codes: 10 a minute per player (M1; every game registers its own square, so no lifetime cap)
  perform private.hit('square:' || auth.uid(), 10);

  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    begin
      insert into public.squares (code, givens, difficulty, rating)
        values (v_code, p_givens, p_difficulty, least(greatest(p_rating, 0), 10000));
      return v_code;
    exception when unique_violation then
      -- The same puzzle registered meanwhile: its code. Otherwise the code was taken: draw again.
      select code into v_code from public.squares where givens = p_givens;
      if found then return v_code; end if;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------- the hand-off, gone (L2)
drop table if exists public.signin_handoffs;

-- ---------------------------------------------------------------- start_game
-- As in daily_month_badge, rate limited.
create or replace function public.start_game(p_mode text, p_difficulty text default null, p_date_key date default null, p_clash_code text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g public.games;
  diff text;
  target integer;
  today date := (now() at time zone 'utc')::date;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  -- 20 starts a minute is far more than anyone plays (M1)
  perform private.hit('start:' || uid, 20);

  if p_mode = 'ranked' then
    if private.ranked_restricted(uid) then raise exception 'ranked_restricted'; end if;
    perform public.finish_game(id, false, 0, 0, null, null, null)
      from public.games where user_id = uid and mode = 'ranked' and finished_at is null;
    select private.ranked_target(elo) into target from public.profiles where id = uid;
    diff := private.rating_difficulty(target);
    insert into public.games (user_id, mode, difficulty, seed, rating, target_rating)
      values (uid, 'ranked', diff, 'ranked:' || replace(gen_random_uuid()::text, '-', ''), target, target)
      returning * into g;
    return json_build_object('game_id', g.id, 'seed', g.seed, 'difficulty', g.difficulty,
      'target_rating', target, 'resumed', false);

  elsif p_mode = 'casual' then
    if p_difficulty is null or p_difficulty not in ('easy', 'medium', 'hard') then raise exception 'bad_difficulty'; end if;
    -- one open Casual game: a new one closes the old as abandoned (one start at a time per
    -- player, so a double tap can't trip the one-open index)
    perform 1 from public.profiles where id = uid for update;
    update public.games set finished_at = now(), won = false, seconds = 0
      where user_id = uid and mode = 'casual' and finished_at is null;
    insert into public.games (user_id, mode, difficulty, seed, rating)
      values (uid, 'casual', p_difficulty, 'casual:' || replace(gen_random_uuid()::text, '-', ''), private.clamp_rating(p_difficulty, null))
      returning * into g;

  elsif p_mode = 'daily' then
    -- The app's day turns at 3 AM local time, so a player's day is UTC-15h to UTC+11h: their
    -- date is yesterday's (UTC) only until 15:00 UTC, tomorrow's only from 13:00 UTC.
    if p_date_key is null
       or not (p_date_key = today
               or (p_date_key = today - 1 and extract(hour from now() at time zone 'utc') < 15)
               or (p_date_key = today + 1 and extract(hour from now() at time zone 'utc') >= 13)) then
      raise exception 'bad_date';
    end if;
    if exists (select 1 from public.games where user_id = uid and mode = 'daily' and date_key = p_date_key and won)
       -- a day filled in with Stardust is done too
       or exists (select 1 from public.daily_mends where player_id = uid and date_key = p_date_key) then
      raise exception 'daily_done';
    end if;
    select * into g from public.games
      where user_id = uid and mode = 'daily' and date_key = p_date_key and finished_at is null;
    if found then
      return json_build_object('game_id', g.id, 'seed', g.seed, 'difficulty', g.difficulty, 'resumed', true);
    end if;
    insert into public.games (user_id, mode, difficulty, seed, date_key, rating)
      values (uid, 'daily', 'medium', 'daily:' || to_char(p_date_key, 'YYYY-MM-DD'), p_date_key, private.clamp_rating('medium', null))
      returning * into g;

  elsif p_mode = 'clash' then
    if p_clash_code is null or p_clash_code !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$' then raise exception 'bad_code'; end if;
    perform 1 from public.profiles where id = uid for update;
    diff := private.code_difficulty(p_clash_code);
    insert into public.clashes (code, difficulty, created_by) values (p_clash_code, diff, uid)
      on conflict (code) do nothing;
    select * into g from public.games where user_id = uid and mode = 'clash' and clash_code = p_clash_code;
    if found then
      if g.finished_at is not null then raise exception 'clash_played'; end if;
      return json_build_object('game_id', g.id, 'seed', g.seed, 'difficulty', g.difficulty, 'resumed', true);
    end if;
    -- at most 3 open Clash games: a 4th closes the oldest as abandoned
    update public.games set finished_at = now(), won = false, seconds = 0
      where id in (select id from public.games where user_id = uid and mode = 'clash' and finished_at is null
                   order by started_at desc offset 2);
    insert into public.games (user_id, mode, difficulty, seed, clash_code, rating)
      values (uid, 'clash', diff, 'clash:' || p_clash_code, p_clash_code, private.clamp_rating(diff, null))
      returning * into g;

  else
    raise exception 'bad_mode';
  end if;

  return json_build_object('game_id', g.id, 'seed', g.seed, 'difficulty', g.difficulty, 'resumed', false);
end;
$$;

-- ---------------------------------------------------------------- finish_game
-- As in ranked_length, reading the audit from private.game_audits.
create or replace function public.finish_game(
  p_game_id uuid,
  p_won boolean,
  p_mistakes integer,
  p_hints integer,
  p_seconds integer,
  p_rating integer,
  p_grid text
) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  dev boolean := private.dev_on(auth.uid());
  g public.games;
  p public.profiles;
  target integer;
  raw integer;
  paused integer;
  wall integer;
  secs integer;
  min_secs integer;
  v_mistakes integer := least(greatest(coalesce(p_mistakes, 0), 0), 3);
  v_hints integer := least(greatest(coalesce(p_hints, 0), 0), 3);
  base integer;
  dust integer := 0;
  v_spirit boolean := false;
  delta integer;
  bonus numeric := 0;
  hint_cut numeric := 0;
  unrated text := null;
  elo_json json := null;
  daily_json json := null;
  drop_json json := null;
  progress_json json := null;
  influence integer := 0;
  solved_today integer := 0;
  capped boolean := false;
  -- the game's solve audit (audit-solve), kept where the player can't read it
  a jsonb;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into g from public.games where id = p_game_id and user_id = uid for update;
  if not found then raise exception 'no_game'; end if;
  if g.finished_at is not null then raise exception 'already_finished'; end if;
  -- Ranked stored its target rating at start
  target := coalesce(g.target_rating, g.rating);
  select audit into a from private.game_audits where game_id = g.id;

  -- Time. Paused time (each pause counting up to 5 minutes, the open one too) comes off the
  -- shown clock; for the speed bonus and the Clash result, at most 2 minutes of it does.
  raw := greatest(extract(epoch from now() - g.started_at)::integer, 0);
  paused := g.paused_seconds
    + case when g.paused_at is null then 0 else least(extract(epoch from now() - g.paused_at)::integer, 300) end;
  wall := greatest(raw - paused, 0);
  secs := case when g.mode in ('ranked', 'clash') then greatest(raw - least(paused, 120), 0)
               else least(greatest(coalesce(p_seconds, wall), 0), wall) end;

  if p_won then
    if not private.valid_solution(p_grid) then raise exception 'invalid_solution'; end if;
    -- Nobody fills a whole square this fast by hand (dev mode's instant solve aside).
    min_secs := case g.difficulty when 'easy' then 15 when 'medium' then 30 else 45 end;
    if wall < min_secs and not dev then raise exception 'too_fast'; end if;
  end if;

  -- A Ranked win needs a clean audit of this very grid (not in dev mode), and a player
  -- restricted from Ranked meanwhile gets no Elo for it.
  if g.mode = 'ranked' and p_won and not dev then
    if a is null then unrated := 'unchecked';
    elsif coalesce((a ->> 'copied')::boolean, true) or (a ->> 'solution') is distinct from p_grid then unrated := 'copied';
    end if;
  end if;
  if g.mode = 'ranked' and p_won and unrated is null and private.ranked_restricted(uid) then
    unrated := 'restricted';
  end if;
  -- a bot can fake its move times, not the server's clock: a rated win takes a fifth of par (C3)
  if g.mode = 'ranked' and p_won and unrated is null and not dev and wall < private.par_seconds(target) / 5 then
    unrated := 'too_quick';
  end if;

  -- The square's rating (for the easy-square discount, and stored on the game): its target, or the audited puzzle's rating
  -- for a clean win; never the client's p_rating. Other modes keep the client's rating, clamped.
  g.rating := case
    when g.mode = 'ranked' then
      case when p_won and unrated is null and (a ->> 'rating') is not null
           then private.clamp_rating(g.difficulty, (a ->> 'rating')::integer, target)
           else target end
    else private.clamp_rating(g.difficulty, coalesce(p_rating, g.rating), null) end;
  select * into p from public.profiles where id = uid for update;

  -- Rated solves today (UTC), flagged Ranked wins left out; dev mode counts none.
  if p_won then
    select count(*) into solved_today from public.games gg
      where gg.user_id = uid and gg.won and gg.finished_at >= date_trunc('day', now()) and gg.id <> g.id
        and not exists (select 1 from private.review_flags rf where rf.game_id = gg.id);
    if dev then solved_today := 0; end if;
  end if;

  if p_won then
    base := case g.mode when 'daily' then 12 when 'ranked' then 20
              else case g.difficulty when 'easy' then 4 when 'medium' then 8 else 15 end end;
    dust := case when unrated is null then greatest(1, base - v_mistakes * 2 - v_hints) else 1 end;
    -- Casual and Clash pay in full for the first 20 solves of the day
    if g.mode in ('casual', 'clash') and solved_today >= 20 then dust := least(dust, 1); end if;
    p.stardust := p.stardust + dust;
  end if;

  if g.mode = 'ranked' then
    g.elo_before := p.elo;
    -- an even match against your own Elo (held to 150..3000): squares level off above 1200 so they
    -- stay short, and Elo keeps its meaning. A square easier than its target (100 of slack for the
    -- generator's spread) is discounted by the difference; a harder one earns no premium, so a
    -- client can't gain by choosing its own puzzle (C2 wins, until B11 binds the givens).
    delta := case when unrated is null then private.elo_delta(p.elo,
               private.ranked_opponent(p.elo) + least(g.rating - target + 100, 0), p_won, p.ranked_games) else 0 end;
    if p_won and delta > 0 then
      -- pauses beyond 2 minutes can lose the bonus but never cause the slow cut
      -- par goes by the target the server chose, not the square's claimed rating
      bonus := greatest(private.speed_bonus(secs, target), least(private.speed_bonus(wall, target), 0));
      -- Speed bonus first, then the hint cut, so hints can't be earned back by speed.
      hint_cut := least(1, v_hints * 0.25);
    end if;
    delta := round(delta * (1 + bonus) * (1 - hint_cut));
    p.elo := greatest(0, p.elo + delta);
    p.ranked_games := p.ranked_games + 1;
    g.elo_after := p.elo;
    elo_json := json_build_object('before', g.elo_before, 'after', g.elo_after,
      'protectedLoss', not p_won and delta = 0, 'bonus', bonus, 'hintCut', hint_cut, 'unrated', unrated);
    -- flags for review: copied and unchecked wins (at most 20 open per player)
    if unrated in ('copied', 'unchecked', 'too_quick')
       and (select count(*) from private.review_flags where user_id = uid and not reviewed) < 20 then
      insert into private.review_flags (user_id, game_id, reason, audit) values (uid, g.id, unrated, a);
    end if;
  end if;

  -- Rated solves count toward the next part and the Spirit (first 9 a day) and the affinity
  -- (first 25), UTC days.
  if p_won and unrated is null then
    if solved_today < 9 then
      p.spirit_pity := p.spirit_pity + 1;
      if private.spirit_roll(p.spirit_pity) or (dev and p.dev_next_spirit) then
        v_spirit := true;
        p.spirits := p.spirits + 1;
        p.spirit_pity := 0;
        p.dev_next_spirit := false;
      end if;
    else
      capped := true;
    end if;
  end if;

  update public.profiles
    set elo = p.elo, ranked_games = p.ranked_games, stardust = p.stardust, spirits = p.spirits, spirit_pity = p.spirit_pity,
        dev_next_spirit = p.dev_next_spirit
    where id = uid;
  update public.games
    set finished_at = now(), won = p_won, seconds = secs, mistakes = v_mistakes, hints = v_hints,
        rating = g.rating, elo_before = g.elo_before, elo_after = g.elo_after, stardust = dust, spirit = v_spirit,
        paused_at = null
    where id = g.id;
  if dust <> 0 or v_spirit then
    insert into private.ledger (player_id, reason, ref, stardust, spirits)
      values (uid, 'solve', g.id::text, dust, case when v_spirit then 1 else 0 end);
  end if;

  if p_won and unrated is null then
    if solved_today < 9 then
      update public.profiles set part_progress = (part_progress + 1) % 3 where id = uid
        returning part_progress into p.part_progress;
      if p.part_progress = 0 then drop_json := private.drop_part(uid, g.id); end if;
      progress_json := json_build_object('count', p.part_progress, 'every', 3);
    end if;

    -- influence: real players only
    if p.affinity is not null and solved_today < 25 and not p.test_account then
      influence := case g.mode
          when 'daily' then 4
          when 'ranked' then 3 + least(3, g.elo_before / 1000)
          when 'clash' then 3
          else case g.difficulty when 'easy' then 1 when 'medium' then 2 else 3 end
        end + case when v_mistakes = 0 and v_hints = 0 then 1 else 0 end;
      insert into public.affinity_months (month, player_id, affinity, influence, solves)
        values (date_trunc('month', now())::date, uid, p.affinity, influence, 1)
      on conflict (month, player_id, affinity) do update
        set influence = public.affinity_months.influence + excluded.influence,
            solves = public.affinity_months.solves + 1;
    end if;
  end if;

  -- the month so far, and its badge at 20 days (daily_month)
  if g.mode = 'daily' then
    daily_json := private.daily_month(uid, date_trunc('month', g.date_key)::date);
  end if;

  return json_build_object('seconds', secs, 'dust', dust, 'spirit', v_spirit, 'elo', elo_json, 'daily', daily_json,
    'drop', drop_json, 'progress', progress_json, 'partsCapped', capped,
    'dustCapped', p_won and g.mode in ('casual', 'clash') and solved_today >= 20,
    'influence', case when influence > 0 then json_build_object('affinity', p.affinity, 'amount', influence) end);
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
