-- Full review, batch B2 (docs/FULL_REVIEW.md C5, decision D2 default, approved 2026-10-20):
-- the Daily month reward becomes real.
--
-- * private.daily_month(player, month): the month's solved and filled-in days, and the dated
--   badge 'daily-YYYY-MM' once 20 of them are done. Called by
--   finish_game for every Daily and by mend_daily; its answer is the result's 'daily' block,
--   now with need, badge and badgeNew.
-- * start_game: the Daily window follows the app's 3 AM day: yesterday's square only while it
--   is still yesterday somewhere (before 15:00 UTC), tomorrow's only once it is tomorrow
--   somewhere (from 13:00 UTC). (Full review L10, the half left from B1.)
-- * mend_daily: the same 3 AM day, so the last evening of a month can still fill in that
--   month; 3 fill-ins per month of the filled-in day.
-- * This month: anyone already at 20 days gets the badge now.
--
-- Data: badges added for players already at 20 days this month; nothing else changes.
-- Undo: a later migration restoring finish_game, start_game and mend_daily from
-- review_integrity; badges already given stay.

create function private.daily_month(p_player uuid, p_month date) returns json
language plpgsql security definer set search_path = '' as $$
declare
  days integer := extract(day from (p_month + interval '1 month - 1 day'))::integer;
  need integer := least(days, 20);
  done integer;
  v_badge text := 'daily-' || to_char(p_month, 'YYYY-MM');
  is_new boolean := false;
begin
  -- solved days plus filled-in ones (mend_daily), each day once
  select count(*) into done from (
    select date_key from public.games
      where user_id = p_player and mode = 'daily' and won and date_key >= p_month and date_key < (p_month + interval '1 month')::date
    union
    select date_key from public.daily_mends
      where player_id = p_player and date_key >= p_month and date_key < (p_month + interval '1 month')::date
  ) d;
  if done >= need then
    insert into public.badges (id, source) values (v_badge, 'earned') on conflict do nothing;
    insert into public.player_badges (player_id, badge) values (p_player, v_badge) on conflict do nothing;
    is_new := found;
  end if;
  return json_build_object('done', done, 'days', days, 'need', need, 'monthComplete', done >= need,
                           'badge', v_badge, 'badgeNew', is_new);
end;
$$;

-- ---------------------------------------------------------------- finish_game
-- As in review_integrity, with the month (and its badge) from daily_month.
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
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into g from public.games where id = p_game_id and user_id = uid for update;
  if not found then raise exception 'no_game'; end if;
  if g.finished_at is not null then raise exception 'already_finished'; end if;
  -- Ranked stored its target rating at start
  target := coalesce(g.target_rating, g.rating);

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
    if g.audit is null then unrated := 'unchecked';
    elsif coalesce((g.audit ->> 'copied')::boolean, true) or (g.audit ->> 'solution') is distinct from p_grid then unrated := 'copied';
    end if;
  end if;
  if g.mode = 'ranked' and p_won and unrated is null and private.ranked_restricted(uid) then
    unrated := 'restricted';
  end if;

  -- The rating: Ranked is priced on its target, or the audited puzzle's rating for a clean
  -- win; never on the client's p_rating. Other modes keep the client's rating, clamped.
  g.rating := case
    when g.mode = 'ranked' then
      case when p_won and unrated is null and (g.audit ->> 'rating') is not null
           then private.clamp_rating(g.difficulty, (g.audit ->> 'rating')::integer, target)
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
    delta := case when unrated is null then private.elo_delta(p.elo, g.rating, p_won, p.ranked_games) else 0 end;
    if p_won and delta > 0 then
      -- pauses beyond 2 minutes can lose the bonus but never cause the slow cut
      bonus := greatest(private.speed_bonus(secs, g.rating), least(private.speed_bonus(wall, g.rating), 0));
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
    if unrated in ('copied', 'unchecked')
       and (select count(*) from private.review_flags where user_id = uid and not reviewed) < 20 then
      insert into private.review_flags (user_id, game_id, reason, audit) values (uid, g.id, unrated, g.audit);
    end if;
  end if;

  -- Rated solves count toward the next part and the Spirit (first 9 a day) and the affinity
  -- (first 25), UTC days.
  if p_won and unrated is null then
    if solved_today < 9 then
      p.spirit_pity := p.spirit_pity + 1;
      if p.spirit_pity >= 700 or private.rand() < 0.0015 or (dev and p.dev_next_spirit) then
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
          when 'ranked' then 3 + least(3, g.rating / 1000)
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

-- ---------------------------------------------------------------- start_game: the Daily window
-- As in review_integrity, with the window above.
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

-- ---------------------------------------------------------------- mend_daily: the month and its badge
-- As in review_integrity, on the app's 3 AM day like start_game (so the last evening of a month
-- can still fill in that month, west of UTC too), and the answer carries the month (a fill-in
-- can complete it). The 3 a month count per the filled-in day's own month.
create or replace function public.mend_daily(p_date date) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  utc_now timestamp := now() at time zone 'utc';
  -- the app's day (3 AM local) in the furthest-west and furthest-east time zones
  earliest date := (utc_now - interval '15 hours')::date;
  latest date := (utc_now + interval '11 hours')::date;
  month_start date := date_trunc('month', p_date)::date;
  used integer;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_date is null or p_date >= latest or month_start < date_trunc('month', earliest)::date then raise exception 'bad_date'; end if;
  perform 1 from public.profiles where id = uid for update;
  if exists (select 1 from public.games where user_id = uid and mode = 'daily' and won and date_key = p_date)
     or exists (select 1 from public.daily_mends where player_id = uid and date_key = p_date) then
    raise exception 'already_solved';
  end if;
  select count(*) into used from public.daily_mends
    where player_id = uid and date_key >= month_start and date_key < (month_start + interval '1 month')::date;
  if used >= 3 then raise exception 'no_mends_left'; end if;
  update public.profiles set stardust = stardust - 300 where id = uid and stardust >= 300;
  if not found then raise exception 'not_enough_stardust'; end if;
  insert into public.daily_mends (player_id, date_key) values (uid, p_date);
  update public.games set finished_at = now(), won = false, seconds = 0
    where user_id = uid and mode = 'daily' and date_key = p_date and finished_at is null;
  insert into private.ledger (player_id, reason, ref, stardust) values (uid, 'mend', p_date::text, -300);
  return json_build_object('date', p_date, 'left', 2 - used,
    'daily', private.daily_month(uid, month_start));
end;
$$;

-- ---------------------------------------------------------------- this month so far
-- (and the month just ended, if this is applied in its first hours: the app's day may still be
-- in it somewhere)
select private.daily_month(p.player, p.month)
  from (select distinct user_id as player, date_trunc('month', date_key)::date as month from public.games
        where mode = 'daily' and won
          and date_key >= date_trunc('month', (now() at time zone 'utc') - interval '15 hours')::date) p;

-- ---------------------------------------------------------------- grants
revoke execute on all functions in schema private from public, anon, authenticated;
