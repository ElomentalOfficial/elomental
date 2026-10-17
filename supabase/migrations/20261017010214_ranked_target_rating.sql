-- Ranked aims each puzzle at the player's Elo instead of three tiers.
--
-- start_game picks a target rating from Elo (150-3200) and stores it as the
-- game's rating; the client generates a puzzle rated within about 100 of it
-- (the window widens to at most 350 when attempts run out). finish_game only
-- accepts a reported rating close to that target, and par time scales with
-- the rating so a 2000-rated square isn't judged against a 20-minute par.

-- ---------------------------------------------------------------- helpers
-- Ranked: within 350 of the target the server picked. Other modes: the band
-- their (gentler) generation profiles produce. Never outside 100-3500.
drop function private.clamp_rating(text, integer);
create function private.clamp_rating(difficulty text, reported integer, target integer default null) returns integer
language sql immutable set search_path = '' as $$
  select least(greatest(
    case
      when target is not null then least(greatest(coalesce(reported, target), target - 350), target + 350)
      when difficulty = 'easy' then least(greatest(coalesce(reported, 160), 140), 250)
      when difficulty = 'medium' then least(greatest(coalesce(reported, 400), 290), 800)
      else least(greatest(coalesce(reported, 600), 290), 1500)
    end, 100), 3500);
$$;

-- The rating a ranked puzzle aims for: the player's own Elo, kept in range.
create function private.ranked_target(elo integer) returns integer
language sql immutable set search_path = '' as $$
  select least(greatest(elo, 150), 3200);
$$;

-- The tier a ranked rating falls in (Stardust and the too-fast floor still go by tier).
create function private.rating_difficulty(rating integer) returns text
language sql immutable set search_path = '' as $$
  select case when rating < 300 then 'easy' when rating < 750 then 'medium' else 'hard' end;
$$;

-- Par time for a ranked puzzle: about 6 minutes at 150, 19 at 1000, 34 at 2000, at most an hour.
create function private.par_seconds(rating integer) returns integer
language sql immutable set search_path = '' as $$
  select least(greatest(240 + round(0.9 * rating)::integer, 360), 3600);
$$;

drop function private.speed_bonus(integer, text);
create function private.speed_bonus(seconds integer, rating integer) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when r <= 0.5 then 0.25
    when r <= 0.75 then 0.15
    when r <= 1 then 0.10
    when r <= 2 then 0
    else -0.25
  end
  from (select seconds::numeric / private.par_seconds(rating) as r) as t;
$$;

-- ---------------------------------------------------------------- start_game
create or replace function public.start_game(
  p_mode text,
  p_difficulty text default null,
  p_date_key date default null,
  p_clash_code text default null
) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g public.games;
  diff text;
  target integer;
  today date := (now() at time zone 'utc')::date;
begin
  if uid is null then raise exception 'not_signed_in'; end if;

  if p_mode = 'ranked' then
    -- An open ranked game left behind counts as a loss, so restarting can't
    -- be used to fish for an easier square.
    perform public.finish_game(id, false, 0, 0, null, null, null)
      from public.games where user_id = uid and mode = 'ranked' and finished_at is null;
    select private.ranked_target(elo) into target from public.profiles where id = uid;
    diff := private.rating_difficulty(target);
    insert into public.games (user_id, mode, difficulty, seed, rating)
      values (uid, 'ranked', diff, 'ranked:' || replace(gen_random_uuid()::text, '-', ''), target)
      returning * into g;
    return json_build_object('game_id', g.id, 'seed', g.seed, 'difficulty', g.difficulty,
      'target_rating', target, 'resumed', false);

  elsif p_mode = 'casual' then
    if p_difficulty is null or p_difficulty not in ('easy', 'medium', 'hard') then raise exception 'bad_difficulty'; end if;
    insert into public.games (user_id, mode, difficulty, seed, rating)
      values (uid, 'casual', p_difficulty, 'casual:' || replace(gen_random_uuid()::text, '-', ''), private.clamp_rating(p_difficulty, null))
      returning * into g;

  elsif p_mode = 'daily' then
    -- The player's local date (3 AM reset) must be within a day of UTC today.
    if p_date_key is null or p_date_key not between today - 1 and today + 1 then raise exception 'bad_date'; end if;
    select * into g from public.games where user_id = uid and mode = 'daily' and date_key = p_date_key;
    if found then
      if g.finished_at is not null then raise exception 'daily_done'; end if;
      return json_build_object('game_id', g.id, 'seed', g.seed, 'difficulty', g.difficulty, 'resumed', true);
    end if;
    insert into public.games (user_id, mode, difficulty, seed, date_key, rating)
      values (uid, 'daily', 'medium', 'daily:' || to_char(p_date_key, 'YYYY-MM-DD'), p_date_key, private.clamp_rating('medium', null))
      returning * into g;

  elsif p_mode = 'clash' then
    if p_clash_code is null or p_clash_code !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$' then raise exception 'bad_code'; end if;
    diff := private.code_difficulty(p_clash_code);
    insert into public.clashes (code, difficulty, created_by) values (p_clash_code, diff, uid)
      on conflict (code) do nothing;
    select * into g from public.games where user_id = uid and mode = 'clash' and clash_code = p_clash_code;
    if found then
      if g.finished_at is not null then raise exception 'clash_played'; end if;
      return json_build_object('game_id', g.id, 'seed', g.seed, 'difficulty', g.difficulty, 'resumed', true);
    end if;
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
-- As before, except Ranked clamps the reported rating around the target that
-- start_game stored, and its speed bonus uses the rating-based par.
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
  g public.games;
  p public.profiles;
  wall integer;
  secs integer;
  min_secs integer;
  v_mistakes integer := least(greatest(coalesce(p_mistakes, 0), 0), 3);
  v_hints integer := least(greatest(coalesce(p_hints, 0), 0), 3);
  base integer;
  dust integer := 0;
  v_crown boolean := false;
  delta integer;
  bonus numeric := 0;
  hint_cut numeric := 0;
  elo_json json := null;
  daily_json json := null;
  month_start date;
  days integer;
  done integer;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into g from public.games where id = p_game_id and user_id = uid for update;
  if not found then raise exception 'no_game'; end if;
  if g.finished_at is not null then raise exception 'already_finished'; end if;

  wall := greatest(extract(epoch from now() - g.started_at)::integer, 0);
  secs := case when g.mode in ('ranked', 'clash') then wall
               else least(greatest(coalesce(p_seconds, wall), 0), wall) end;

  if p_won then
    if not private.valid_solution(p_grid) then raise exception 'invalid_solution'; end if;
    -- Nobody fills a whole square this fast by hand.
    min_secs := case g.difficulty when 'easy' then 15 when 'medium' then 30 else 45 end;
    if secs < min_secs then raise exception 'too_fast'; end if;
  end if;

  -- Ranked games stored their target rating at start; the puzzle's own rating must be near it.
  g.rating := private.clamp_rating(g.difficulty, coalesce(p_rating, g.rating),
    case when g.mode = 'ranked' then g.rating end);
  select * into p from public.profiles where id = uid for update;

  if p_won then
    base := case g.mode when 'daily' then 12 when 'ranked' then 20
              else case g.difficulty when 'easy' then 4 when 'medium' then 8 else 15 end end;
    dust := greatest(1, base - v_mistakes * 2 - v_hints);
    p.stardust := p.stardust + dust;
    p.pity := p.pity + 1;
    if p.pity >= 40 or random() < 0.03 then
      v_crown := true;
      p.crowns := p.crowns + 1;
      p.pity := 0;
    end if;
  end if;

  if g.mode = 'ranked' then
    g.elo_before := p.elo;
    delta := private.elo_delta(p.elo, g.rating, p_won, p.ranked_games);
    if p_won and delta > 0 then
      bonus := private.speed_bonus(secs, g.rating);
      -- Speed bonus first, then the hint cut, so hints can't be earned back by speed.
      hint_cut := least(1, v_hints * 0.25);
    end if;
    delta := round(delta * (1 + bonus) * (1 - hint_cut));
    p.elo := greatest(0, p.elo + delta);
    p.ranked_games := p.ranked_games + 1;
    g.elo_after := p.elo;
    elo_json := json_build_object('before', g.elo_before, 'after', g.elo_after,
      'protectedLoss', not p_won and delta = 0, 'bonus', bonus, 'hintCut', hint_cut);
  end if;

  update public.profiles
    set elo = p.elo, ranked_games = p.ranked_games, stardust = p.stardust, crowns = p.crowns, pity = p.pity
    where id = uid;
  update public.games
    set finished_at = now(), won = p_won, seconds = secs, mistakes = v_mistakes, hints = v_hints,
        rating = g.rating, elo_before = g.elo_before, elo_after = g.elo_after, stardust = dust, crown = v_crown
    where id = g.id;

  if g.mode = 'daily' then
    month_start := date_trunc('month', g.date_key)::date;
    days := extract(day from (month_start + interval '1 month - 1 day'))::integer;
    select count(*) into done from public.games
      where user_id = uid and mode = 'daily' and won
        and date_key >= month_start and date_key < (month_start + interval '1 month')::date;
    daily_json := json_build_object('done', done, 'days', days, 'monthComplete', done = days);
  end if;

  return json_build_object('seconds', secs, 'dust', dust, 'crown', v_crown, 'elo', elo_json, 'daily', daily_json);
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
