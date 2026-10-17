-- Pausing Ranked and Clash stops the clock, tracked on the server so the
-- race time stays honest: up to 3 pauses per game, each free for up to 5
-- minutes (time paused beyond that counts as playing time). The board is
-- hidden while paused.

alter table public.games
  add column paused_at timestamptz,
  add column paused_seconds integer not null default 0,
  add column pauses smallint not null default 0;

create function public.pause_game(p_game_id uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
begin
  select * into g from public.games where id = p_game_id and user_id = auth.uid() for update;
  if not found or g.finished_at is not null then raise exception 'no_game'; end if;
  if g.paused_at is not null then
    return json_build_object('pauses_left', greatest(0, 3 - g.pauses));
  end if;
  if g.mode in ('ranked', 'clash') and g.pauses >= 3 then raise exception 'no_pauses_left'; end if;
  update public.games set paused_at = now(), pauses = pauses + 1 where id = g.id;
  return json_build_object('pauses_left', greatest(0, 3 - g.pauses - 1));
end;
$$;

create function public.resume_game(p_game_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.games
    set paused_seconds = paused_seconds + least(extract(epoch from now() - paused_at)::integer, 300),
        paused_at = null
    where id = p_game_id and user_id = auth.uid() and paused_at is not null and finished_at is null;
end;
$$;

revoke execute on function public.pause_game(uuid), public.resume_game(uuid) from public, anon;
grant execute on function public.pause_game(uuid), public.resume_game(uuid) to authenticated;

-- finish_game: the server clock leaves out the free part of every pause.
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

  -- (least() ignores NULLs, so the open pause needs an explicit case.)
  wall := extract(epoch from now() - g.started_at)::integer - g.paused_seconds
    - case when g.paused_at is null then 0 else least(extract(epoch from now() - g.paused_at)::integer, 300) end;
  wall := greatest(wall, 0);
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
        rating = g.rating, elo_before = g.elo_before, elo_after = g.elo_after, stardust = dust, crown = v_crown,
        paused_at = null
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
