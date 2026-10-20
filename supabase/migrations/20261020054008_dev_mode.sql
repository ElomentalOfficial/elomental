-- Dev mode (founders only, asked for by the owner 2026-10-20): a switch on the founder's own
-- account that unlocks testing tools, so every screen can be reached without grinding.
--
-- * dev_set_mode(on): founders only (private.is_admin, by confirmed email in private.founders).
-- * dev_action(action, value): founders only, and only while dev mode is on. It changes the
--   founder's own account for real: fill or empty Stardust and Spirits, unlock or remove every
--   part, set the name plate or Elo, choose the next part's rarity, make the next counted solve
--   bring a Spirit, or forget the affinity (so it can be chosen again).
-- * While dev mode is on, finish_game accepts an instant solve (no too_fast check), counts a
--   Ranked win as rated without the solve audit, and counts every solve toward parts (no
--   daily limit). Turning dev mode off clears the queued next part and Spirit.

alter table public.profiles
  add column dev_mode boolean not null default false,
  -- the rarity of the next part to drop (dev mode), then cleared
  add column dev_next_drop text check (dev_next_drop in ('common', 'rare', 'epic', 'mythic')),
  -- the next counted solve brings a Spirit (dev mode), then cleared
  add column dev_next_spirit boolean not null default false;

-- Dev mode is on for this player, and they're a founder (checked every time).
create function private.dev_on(p_player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin(p_player) and coalesce((select dev_mode from public.profiles where id = p_player), false);
$$;

create function public.dev_set_mode(p_on boolean) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not private.is_admin(uid) then raise exception 'not_admin'; end if;
  update public.profiles
    set dev_mode = coalesce(p_on, false),
        dev_next_drop = case when coalesce(p_on, false) then dev_next_drop end,
        dev_next_spirit = coalesce(p_on, false) and dev_next_spirit
    where id = uid;
  return json_build_object('devMode', coalesce(p_on, false));
end;
$$;

create function public.dev_action(p_action text, p_value text default null) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  n integer;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not private.is_admin(uid) then raise exception 'not_admin'; end if;
  if not private.dev_on(uid) then raise exception 'dev_off'; end if;
  case p_action
    when 'fill' then
      update public.profiles set stardust = 999999, spirits = 99 where id = uid;
    when 'empty' then
      update public.profiles set stardust = 0, spirits = 0 where id = uid;
    when 'unlock_all' then
      insert into public.player_parts (player_id, part_id, how)
        select uid, id, 'forge' from public.parts where source = 'craft' and season_id = private.current_season()
        on conflict do nothing;
    when 'clear_parts' then
      delete from public.player_parts where player_id = uid;
      update public.avatar_loadouts set avatar = null, frame = null where player_id = uid;
    when 'plate' then
      n := p_value::integer;
      if n not between 0 and 4 then raise exception 'bad_request'; end if;
      update public.profiles set plate = n where id = uid;
    when 'elo' then
      n := p_value::integer;
      if n not between 0 and 4800 then raise exception 'bad_request'; end if;
      update public.profiles set elo = n where id = uid;
    when 'next_drop' then
      if p_value not in ('common', 'rare', 'epic', 'mythic') then raise exception 'bad_request'; end if;
      -- and the next counted solve is the one that drops it
      update public.profiles set dev_next_drop = p_value, part_progress = 2 where id = uid;
    when 'next_spirit' then
      update public.profiles set dev_next_spirit = true where id = uid;
    when 'forget_affinity' then
      update public.profiles set affinity = null, affinity_season = null where id = uid;
    else
      raise exception 'bad_request';
  end case;
  return json_build_object('action', p_action);
end;
$$;

-- ---------------------------------------------------------------- drops: the chosen rarity
create or replace function private.drop_part(p_player uuid, p_game uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  x double precision := private.rand();
  v_rarity text;
  v_pity text;
  v_part text;
  dup boolean;
  dust integer := 0;
begin
  select * into p from public.profiles where id = p_player for update;
  v_rarity := case when x < 0.62 then 'common' when x < 0.90 then 'rare' when x < 0.98 then 'epic' else 'mythic' end;
  if p.pity_mythic + 1 >= 25 and v_rarity <> 'mythic' then v_rarity := 'mythic'; v_pity := 'mythic';
  elsif p.pity_epic + 1 >= 10 and v_rarity in ('common', 'rare') then v_rarity := 'epic'; v_pity := 'epic';
  end if;
  -- dev mode: the rarity the founder asked for, once
  if p.dev_next_drop is not null and private.dev_on(p_player) then
    v_rarity := p.dev_next_drop;
    v_pity := null;
  end if;
  update public.profiles set
    pity_epic = case when v_rarity in ('epic', 'mythic') then 0 else pity_epic + 1 end,
    pity_mythic = case when v_rarity = 'mythic' then 0 else pity_mythic + 1 end,
    dev_next_drop = null
    where id = p_player
    returning pity_epic, pity_mythic into p.pity_epic, p.pity_mythic;

  select pt.id into v_part from public.parts pt
    where pt.rarity = v_rarity and pt.source = 'craft' and pt.season_id = private.current_season()
    order by private.rand()
      * case when exists (select 1 from public.player_parts pp where pp.player_id = p_player and pp.part_id = pt.id) then 1 else 3 end
      * case when pt.element = p.affinity then 2 else 1 end desc
    limit 1;

  insert into public.player_parts (player_id, part_id, how) values (p_player, v_part, 'drop') on conflict do nothing;
  dup := not found;
  if dup then
    dust := case v_rarity when 'common' then 20 when 'rare' then 50 when 'epic' then 120 else 300 end;
    update public.profiles set stardust = stardust + dust where id = p_player;
  end if;
  insert into private.ledger (player_id, reason, ref, stardust) values (p_player, case when dup then 'duplicate' else 'drop' end, v_part, dust);
  insert into public.drops (game_id, player_id, rarity, part_id, duplicate, stardust, pity_hit)
    values (p_game, p_player, v_rarity, v_part, dup, dust, v_pity);
  return json_build_object('rarity', v_rarity, 'part', v_part, 'duplicate', dup, 'stardust', dust, 'pity', v_pity,
    'guarantee', json_build_object('epic', 10 - p.pity_epic, 'mythic', 25 - p.pity_mythic));
end;
$$;

-- ---------------------------------------------------------------- finish_game
-- As in whole_avatars, plus the dev-mode exceptions above.
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
  solved_today integer;
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
    -- Nobody fills a whole square this fast by hand (dev mode's instant solve aside).
    min_secs := case g.difficulty when 'easy' then 15 when 'medium' then 30 else 45 end;
    if secs < min_secs and not dev then raise exception 'too_fast'; end if;
  end if;

  -- A Ranked win needs a clean audit of this very grid (not in dev mode).
  if g.mode = 'ranked' and p_won and not dev then
    if g.audit is null then unrated := 'unchecked';
    elsif coalesce((g.audit ->> 'copied')::boolean, true) or (g.audit ->> 'solution') is distinct from p_grid then unrated := 'copied';
    end if;
  end if;

  -- Ranked games stored their target rating at start; the puzzle's own rating
  -- (graded by the audit when there is one) must be near it.
  g.rating := private.clamp_rating(g.difficulty,
    coalesce(case when unrated is null then (g.audit ->> 'rating')::integer end, p_rating, g.rating),
    case when g.mode = 'ranked' then g.rating end);
  select * into p from public.profiles where id = uid for update;

  if p_won then
    base := case g.mode when 'daily' then 12 when 'ranked' then 20
              else case g.difficulty when 'easy' then 4 when 'medium' then 8 else 15 end end;
    dust := case when unrated is null then greatest(1, base - v_mistakes * 2 - v_hints) else 1 end;
    p.stardust := p.stardust + dust;
  end if;

  if g.mode = 'ranked' then
    g.elo_before := p.elo;
    delta := case when unrated is null then private.elo_delta(p.elo, g.rating, p_won, p.ranked_games) else 0 end;
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
      'protectedLoss', not p_won and delta = 0, 'bonus', bonus, 'hintCut', hint_cut, 'unrated', unrated);
    if unrated is not null then
      insert into private.review_flags (user_id, game_id, reason, audit) values (uid, g.id, unrated, g.audit);
    end if;
  end if;

  -- Rated solves count toward the next part (first 9 a day: 3 parts; every one in dev mode),
  -- the Spirit (the same) and the affinity (first 25), UTC days.
  if p_won and unrated is null then
    select count(*) into solved_today from public.games
      where user_id = uid and won and finished_at >= date_trunc('day', now()) and id <> g.id;
    if dev then solved_today := 0; end if;
    if solved_today < 9 then
      p.spirit_pity := p.spirit_pity + 1;
      if p.spirit_pity >= 700 or private.rand() < 0.0015 or (dev and p.dev_next_spirit) then
        v_spirit := true;
        p.spirits := p.spirits + 1;
        p.spirit_pity := 0;
        p.dev_next_spirit := false;
      end if;
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

    if p.affinity is not null and solved_today < 25 then
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

  if g.mode = 'daily' then
    month_start := date_trunc('month', g.date_key)::date;
    days := extract(day from (month_start + interval '1 month - 1 day'))::integer;
    -- solved days plus mended ones (mend_daily), each day once
    select count(*) into done from (
      select date_key from public.games
        where user_id = uid and mode = 'daily' and won and date_key >= month_start and date_key < (month_start + interval '1 month')::date
      union
      select date_key from public.daily_mends
        where player_id = uid and date_key >= month_start and date_key < (month_start + interval '1 month')::date
    ) d;
    daily_json := json_build_object('done', done, 'days', days, 'monthComplete', done = days);
  end if;

  return json_build_object('seconds', secs, 'dust', dust, 'spirit', v_spirit, 'elo', elo_json, 'daily', daily_json,
    'drop', drop_json, 'progress', progress_json,
    'influence', case when influence > 0 then json_build_object('affinity', p.affinity, 'amount', influence) end);
end;
$$;

-- ---------------------------------------------------------------- grants
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.dev_set_mode(boolean), public.dev_action(text, text) from public, anon;
grant execute on function public.dev_set_mode(boolean), public.dev_action(text, text) to authenticated;
