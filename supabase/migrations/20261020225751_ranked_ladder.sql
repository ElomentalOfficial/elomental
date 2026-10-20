-- The Ranked ladder (owner approved 2026-10-21: docs/review/elo-ladder-2026-10-21-economy.md,
-- §3 and variant (c) in §4.6; personas in docs/review/elo-ladder-2026-10-21-ux.md):
--
-- * Five ranks, names only, no divisions: Novice 0, Apprentice 300, Adept 600, Archmage 1000,
--   Elomental 1450 (private.tier_floors). Fresh accounts start at 100; the best settle around
--   1600–1650, where gains fade (the square is priced at 1600 at most).
-- * Squares by stage, not by rating: the Elo picks one of 14 stages (private.ranked_stage) and
--   the stage fixes the square's shape (engine generator.ts RANKED_STAGES). Each rank is one
--   technique family: singles, pointing, pairs and triples, fish and wings, chains. The stage's
--   rating (private.stage_rating) stays the target: par, the rating clamp and the label go by it.
--   start_game stores the stage, so audit-solve deals the same square.
-- * Elo: an even match against your own Elo, as before. K 40 at 100 down to 14 at 1600 and 10
--   at 2000. No Elo lost in Novice (below 300); then a loss costs 0.75× the stake at 300, 1.5×
--   from 500, 1.75× at 1600. The easy-square discount goes: since ranked_integrity the audit
--   rates the very square the server dealt, so its rating is the stage's, not the player's pick.
-- * Comeback square: after two Ranked losses in a row (from 300 Elo up), the next square comes
--   from one stage lower, priced as usual, until a win (profiles.ranked_loss_run).
-- * Rank grace: a rank is kept until Elo is 50 below its floor (profiles.rank_tier, the rank shown
--   everywhere: Home, results, the leaderboard, cards).
-- * Ranked influence by rank: 3, 3, 4, 5, 6 (was 3 + one per 1000 Elo).
-- * Too quick (unrated): a fifth of par as before, but 1.2 s a cell on the singles stages.
-- * One open Ranked game per player (a unique index, and start_game locks the profile).
--
-- Data: every profile's Elo and every Ranked game's elo_before / elo_after are re-expressed on the
-- new scale through one strictly increasing map (below): the leaderboard order is kept, nobody
-- moves down a rank position, and season gains stay consistent. Open Ranked games keep their
-- stored target (ranked_stage null) and finish under the new Elo maths.
-- Deploy order: audit-solve first (it reads ranked_stage when present), then this migration,
-- then the web app, by hand (an app that deals by stage before audit-solve does has every
-- Ranked win flagged). A page loaded before the app ships deals the old way: its wins land as
-- not checked, never as scripted, and a reload fixes it.
-- Undo: the inverse map can't be exact (rounding); restore the functions from ranked_length,
-- elo_curve, gentler_losses, leaderboard, show_founders, ranked_integrity and finish_game_stages,
-- and drop the three columns.

-- the snapshot refresh at the end locks a busy table: give up rather than queue behind one
set local lock_timeout = '5s';

alter table public.games add column ranked_stage smallint;
alter table public.profiles add column rank_tier smallint not null default 0;
alter table public.profiles add column ranked_loss_run smallint not null default 0;

-- At most one open Ranked game per player (start_game also locks the profile). Any extra open
-- ones left from parallel starts are closed first, as abandoned, with no Elo change.
update public.games set finished_at = now(), won = false, seconds = 0
  where mode = 'ranked' and finished_at is null
    and id not in (select distinct on (user_id) id from public.games
                   where mode = 'ranked' and finished_at is null order by user_id, started_at desc);
create unique index games_one_open_ranked on public.games (user_id) where mode = 'ranked' and finished_at is null;

-- ---------------------------------------------------------------- ranks and stages
-- The Elo floors of the five ranks (web: profile.ts TIERS).
create or replace function private.tier_floors() returns integer[]
language sql immutable set search_path = '' as $$ select array[0, 300, 600, 1000, 1450] $$;

-- The stage an Elo plays at, 0 (N1) to 13 (E2): engine RANKED_STAGES[].from.
create function private.ranked_stage(elo integer) returns smallint
language sql immutable set search_path = '' as $$
  select count(*)::smallint
  from unnest(array[200, 300, 400, 500, 600, 700, 800, 900, 1000, 1150, 1300, 1450, 1600]) f
  where elo >= f;
$$;

-- The engine rating a stage stands for (engine RANKED_STAGES[].rating).
create function private.stage_rating(stage smallint) returns integer
language sql immutable set search_path = '' as $$
  select (array[150, 160, 175, 310, 360, 420, 500, 600, 780, 950, 1100, 1350, 1500, 1750])[least(greatest(stage, 0), 13) + 1];
$$;

create or replace function private.ranked_target(elo integer) returns integer
language sql immutable set search_path = '' as $$
  select private.stage_rating(private.ranked_stage(elo));
$$;

-- The rank shown: up as soon as Elo reaches a floor, down only once it is 50 below the one held.
create function private.shown_tier(prev smallint, elo integer) returns smallint
language sql immutable set search_path = '' as $$
  select case
    when now_tier >= prev then now_tier
    when elo >= f[prev + 1] - 50 then prev
    else now_tier
  end
  from (select f, ((select count(*) from unnest(f) x where elo >= x) - 1)::smallint as now_tier
        from (select private.tier_floors() as f) a) t;
$$;

-- ---------------------------------------------------------------- Elo maths
create or replace function private.ranked_opponent(elo integer) returns integer
language sql immutable set search_path = '' as $$
  select least(elo, 1600);
$$;

create or replace function private.elo_k(elo integer) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when elo <= 100 then 40
    when elo <= 600 then 40 - 8 * (elo - 100) / 500.0
    when elo <= 1000 then 32 - 8 * (elo - 600) / 400.0
    when elo <= 1450 then 24 - 6 * (elo - 1000) / 450.0
    when elo <= 1600 then 18 - 4 * (elo - 1450) / 150.0
    when elo <= 2000 then 14 - 4 * (elo - 1600) / 400.0
    else 10
  end;
$$;

create or replace function private.elo_loss_multiplier(elo integer) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when elo <= 300 then 0.75
    when elo <= 500 then 0.75 + 0.75 * (elo - 300) / 200.0
    when elo <= 1600 then 1.5 + 0.25 * (elo - 500) / 1100.0
    else 1.75
  end;
$$;

-- Same signature as before (ranked_elo calls it); games_played is unused.
create or replace function private.elo_delta(player integer, puzzle integer, won boolean, games_played integer) returns integer
language plpgsql immutable set search_path = '' as $$
declare
  expected double precision := 1 / (1 + power(10, (puzzle - player) / 200.0));
  k numeric := private.elo_k(player);
begin
  -- (numeric rounds half up, as the app's Math.round does; a double would round half to even)
  if won then return round((k * (1 - expected))::numeric); end if;
  -- no Elo lost in Novice
  if player < 300 then return 0; end if;
  return -round((k * expected * private.elo_loss_multiplier(player))::numeric);
end;
$$;

-- The fewest seconds a Ranked win can take on the server's clock and still be rated: a fifth of
-- par, but on the singles stages (N1, N2, A1: 43 to 51 empty cells, nothing to work out) 1.2 s a
-- cell, since a practised player clears those well inside par / 5's two minutes.
create function private.quick_seconds(g public.games, target integer) returns integer
language sql immutable set search_path = '' as $$
  select case when g.ranked_stage between 0 and 2
    then ceil(1.2 * (81 - (array[38, 34, 30])[g.ranked_stage + 1]))::integer
    else private.par_seconds(target) / 5 end;
$$;

-- As in finish_game_stages, with the floor above.
create or replace function private.ranked_unrated(g public.games, a jsonb, p_grid text, p_won boolean, dev boolean, wall integer, target integer)
returns text
language plpgsql set search_path = '' as $$
declare
  unrated text := null;
begin
  if g.mode <> 'ranked' or not p_won then return null; end if;
  if not dev then
    if a is null then unrated := 'unchecked';
    elsif coalesce((a ->> 'copied')::boolean, true) or (a ->> 'solution') is distinct from p_grid then unrated := 'copied';
    end if;
  end if;
  if unrated is null and private.ranked_restricted(g.user_id) then
    unrated := 'restricted';
  end if;
  -- a bot can fake its move times, not the server's clock
  if unrated is null and not dev and wall < private.quick_seconds(g, target) then
    unrated := 'too_quick';
  end if;
  return unrated;
end;
$$;

-- As in finish_game_stages, without the easy-square discount, and keeping the rank shown and the
-- run of losses (the comeback square) up to date.
create or replace function private.ranked_elo(uid uuid, g public.games, a jsonb, elo integer, ranked_games integer, p_won boolean,
  unrated text, target integer, secs integer, wall integer, v_hints integer, out elo_after integer, out elo_json json)
language plpgsql set search_path = '' as $$
declare
  delta integer;
  bonus numeric := 0;
  hint_cut numeric := 0;
  tier_before smallint;
  tier_after smallint;
  run smallint;
begin
  delta := case when unrated is null then private.elo_delta(elo, private.ranked_opponent(elo), p_won, ranked_games) else 0 end;
  if p_won and delta > 0 then
    -- pauses beyond 2 minutes can lose the bonus but never cause the slow cut;
    -- par goes by the target the server chose, not the square's claimed rating
    bonus := greatest(private.speed_bonus(secs, target), least(private.speed_bonus(wall, target), 0));
    -- Speed bonus first, then the hint cut, so hints can't be earned back by speed.
    hint_cut := least(1, v_hints * 0.25);
  end if;
  delta := round(delta * (1 + bonus) * (1 - hint_cut));
  elo_after := greatest(0, elo + delta);
  select rank_tier into tier_before from public.profiles where id = uid;
  tier_after := private.shown_tier(tier_before, elo_after);
  update public.profiles
    set rank_tier = tier_after,
        -- only a rated win ends the run (an unchecked one earns nothing, so it keeps the comeback)
        ranked_loss_run = case when p_won and unrated is null then 0 when p_won then ranked_loss_run
                               else least(ranked_loss_run + 1, 9) end
    where id = uid
    returning ranked_loss_run into run;
  elo_json := json_build_object('before', elo, 'after', elo_after,
    'protectedLoss', not p_won and delta = 0, 'bonus', bonus, 'hintCut', hint_cut, 'unrated', unrated,
    'tierBefore', tier_before, 'tier', tier_after, 'stage', g.ranked_stage,
    -- the next square is a step easier (start_game)
    'comeback', run >= 2 and elo_after >= 300 and private.ranked_stage(elo_after) > 0);
  if unrated in ('copied', 'unchecked', 'too_quick')
     and (select count(*) from private.review_flags where user_id = uid and not reviewed) < 20 then
    insert into private.review_flags (user_id, game_id, reason, audit) values (uid, g.id, unrated, a);
  end if;
end;
$$;

-- As in finish_game_stages, with Ranked influence by rank (3, 3, 4, 5, 6).
create or replace function private.count_solve(uid uuid, g public.games, p public.profiles, solved_today integer,
  v_mistakes integer, v_hints integer, out drop_json json, out progress_json json, out influence integer)
language plpgsql set search_path = '' as $$
declare
  progress integer;
begin
  influence := 0;
  if solved_today < 9 then
    update public.profiles set part_progress = (part_progress + 1) % 3 where id = uid
      returning part_progress into progress;
    if progress = 0 then drop_json := private.drop_part(uid, g.id); end if;
    progress_json := json_build_object('count', progress, 'every', 3);
  end if;
  if p.affinity is not null and solved_today < 25 and not p.test_account then
    influence := case g.mode
        when 'daily' then 4
        -- the rank held before this game (p is read before ranked_elo moves it)
        when 'ranked' then 3 + greatest(p.rank_tier - 1, 0)
        when 'clash' then 3
        else case g.difficulty when 'easy' then 1 when 'medium' then 2 else 3 end
      end + case when v_mistakes = 0 and v_hints = 0 then 1 else 0 end;
    insert into public.affinity_months (month, player_id, affinity, influence, solves)
      values (date_trunc('month', now())::date, uid, p.affinity, influence, 1)
    on conflict (month, player_id, affinity) do update
      set influence = public.affinity_months.influence + excluded.influence,
          solves = public.affinity_months.solves + 1;
  end if;
end;
$$;

-- ---------------------------------------------------------------- start_game
-- As in ranked_integrity; Ranked deals the stage of the player's Elo (one lower for a comeback
-- square) and stores it.
create or replace function public.start_game(p_mode text, p_difficulty text default null, p_date_key date default null, p_clash_code text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g public.games;
  p public.profiles;
  diff text;
  target integer;
  stage smallint;
  comeback boolean := false;
  today date := (now() at time zone 'utc')::date;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  -- 20 starts a minute is far more than anyone plays (M1)
  perform private.hit('start:' || uid, 20);

  if p_mode = 'ranked' then
    if private.ranked_restricted(uid) then raise exception 'ranked_restricted'; end if;
    -- one start at a time per player, so parallel starts can't open several squares to pick from
    perform 1 from public.profiles where id = uid for update;
    perform public.finish_game(id, false, 0, 0, null, null, null)
      from public.games where user_id = uid and mode = 'ranked' and finished_at is null;
    -- (after the forfeit above, which counts toward the run of losses)
    select * into p from public.profiles where id = uid;
    stage := private.ranked_stage(p.elo);
    -- after two losses in a row where losses cost Elo, one stage easier until a win
    if p.ranked_loss_run >= 2 and p.elo >= 300 and stage > 0 then
      stage := stage - 1;
      comeback := true;
    end if;
    target := private.stage_rating(stage);
    diff := private.rating_difficulty(target);
    insert into public.games (user_id, mode, difficulty, seed, rating, target_rating, ranked_stage)
      values (uid, 'ranked', diff, 'ranked:' || replace(gen_random_uuid()::text, '-', ''), target, target, stage)
      returning * into g;
    return json_build_object('game_id', g.id, 'seed', g.seed, 'difficulty', g.difficulty,
      'target_rating', target, 'stage', stage, 'comeback', comeback, 'resumed', false);

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

-- ---------------------------------------------------------------- the rank on the leaderboard
-- Tiers counted by the rank shown, not the Elo alone (the grace).
create or replace function private.refresh_lb() returns void
language plpgsql security definer set search_path = '' as $$
declare
  f integer[] := private.tier_floors();
begin
  refresh materialized view concurrently private.lb;
  delete from private.lb_meta;
  insert into private.lb_meta (key, n)
    select 'global', count(*) from private.lb
    union all select 'season', count(*) from private.lb where season_rank is not null
    union all select 'faction:' || affinity, count(*) from private.lb where affinity is not null group by affinity
    union all select 'country:' || country, count(*) from private.lb where country is not null group by country
    union all select 'tier:' || f[i], (select count(*) from private.lb l join public.profiles p on p.id = l.id where p.rank_tier = i - 1)
      from generate_subscripts(f, 1) i;
end;
$$;

-- As in show_founders, with the rank shown ('tier', 0 Novice … 4 Elomental).
create or replace function private.lb_row(r private.lb, place bigint, value integer, me uuid) returns json
language sql stable set search_path = '' as $$
  select json_build_object('place', place, 'id', r.id, 'name', r.display_name, 'title', r.title, 'elo', r.elo,
    'tier', (select rank_tier from public.profiles where id = r.id),
    'value', value, 'plate', r.plate, 'avatar', r.avatar, 'frame', r.frame, 'alive', r.alive,
    'affinity', r.affinity, 'country', r.country, 'me', r.id = me);
$$;

-- As in show_founders, with the rank shown.
create or replace function public.lb_search(p_query text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  q text := lower(trim(coalesce(p_query, '')));
  pat text;
  hits integer;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if length(q) < 2 then return '[]'::json; end if;
  insert into private.search_hits (player_id, minute, n) values (me, date_trunc('minute', now()), 1)
    on conflict (player_id, minute) do update set n = private.search_hits.n + 1
    returning n into hits;
  if hits > 30 then raise exception 'slow_down'; end if;
  delete from private.search_hits where minute < now() - interval '10 minutes';
  pat := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((
    select json_agg(row_to_json(x) order by x.prefix desc, x.score desc, x.elo desc)
    from (
      select p.id, p.display_name as name, p.elo, p.rank_tier as tier, p.title, p.plate, l.avatar, l.frame,
             case when private.ranked_restricted(p.id) then null else r.global_rank end as place,
             lower(p.display_name) like pat as prefix,
             extensions.similarity(lower(p.display_name), q) as score
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.avatar_loadouts l on l.player_id = p.id
      left join private.lb r on r.id = p.id
      where not coalesce(u.is_anonymous, false) and not p.lb_hidden and private.shown(p.test_account)
        and (lower(p.display_name) like pat or lower(p.display_name) operator(extensions.%) q)
      order by lower(p.display_name) like pat desc, extensions.similarity(lower(p.display_name), q) desc
      limit 20
    ) x
  ), '[]'::json);
end;
$$;

-- As in show_founders, with the rank shown.
create or replace function public.player_card(p_player uuid) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  p public.profiles;
  l public.avatar_loadouts;
  anon boolean;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  select * into p from public.profiles where id = p_player;
  select coalesce(is_anonymous, false) into anon from auth.users where id = p_player;
  if not found or p.id is null or (anon and p_player <> me) then return json_build_object('missing', true); end if;
  if (p.lb_hidden or not private.shown(p.test_account)) and p_player <> me then return json_build_object('hidden', true); end if;
  select * into l from public.avatar_loadouts where player_id = p_player;
  return json_build_object(
    'id', p.id, 'name', p.display_name, 'title', p.title, 'elo', p.elo, 'tier', p.rank_tier, 'plate', p.plate,
    'avatar', l.avatar, 'frame', l.frame,
    'alive', coalesce((select polish = 1 from public.player_parts where player_id = p_player and part_id = coalesce(l.avatar, 's0-avatar-happy')), false),
    'peak', greatest(p.elo, coalesce((select max(elo_after) from public.games where user_id = p_player and elo_after is not null), 0)),
    'place', (select global_rank from private.lb where id = p_player),
    'position', (select global_pos from private.lb where id = p_player),
    'notRanked', private.ranked_restricted(p_player),
    'affinity', p.affinity, 'country', p.country,
    'stats', case when p.card_stats or p_player = me then json_build_object(
      'solved', (select count(*) from public.games where user_id = p_player and won),
      'ranked', p.ranked_games) end,
    'badges', coalesce((select json_agg(badge order by earned_at desc) from public.player_badges where player_id = p_player), '[]'::json),
    'showcase', coalesce(
      (select json_agg(b order by i) from unnest(p.showcase) with ordinality as s (b, i)
        where exists (select 1 from public.player_badges where player_id = p_player and badge = s.b)),
      (select json_agg(badge) from (select badge from public.player_badges where player_id = p_player order by earned_at desc limit 3) n),
      '[]'::json),
    'following', exists (select 1 from public.follows where follower = me and followee = p_player),
    'me', p_player = me);
end;
$$;

-- ---------------------------------------------------------------- the founders' Elo tool
-- As in review_integrity; 'elo' takes the new scale (0 to 2000) and sets the rank it shows.
create or replace function public.dev_action(p_action text, p_value text default null) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  n integer;
  before public.profiles;
  after public.profiles;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not private.is_admin(uid) then raise exception 'not_admin'; end if;
  if not private.dev_on(uid) then raise exception 'dev_off'; end if;
  select * into before from public.profiles where id = uid for update;
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
      if n not between 0 and 2000 then raise exception 'bad_request'; end if;
      update public.profiles set elo = n, rank_tier = private.shown_tier(0::smallint, n), ranked_loss_run = 0 where id = uid;
    when 'next_drop' then
      if p_value not in ('common', 'rare', 'epic', 'mythic') then raise exception 'bad_request'; end if;
      update public.profiles set dev_next_drop = p_value, part_progress = 2 where id = uid;
    when 'next_spirit' then
      update public.profiles set dev_next_spirit = true where id = uid;
    when 'forget_affinity' then
      update public.profiles set affinity = null, affinity_season = null where id = uid;
    else
      raise exception 'bad_request';
  end case;
  select * into after from public.profiles where id = uid;
  -- every balance change leaves a trail
  if after.stardust <> before.stardust or after.spirits <> before.spirits then
    insert into private.ledger (player_id, reason, ref, stardust, spirits)
      values (uid, 'dev_' || p_action, p_value, after.stardust - before.stardust, after.spirits - before.spirits);
  end if;
  insert into private.founder_log (founder_id, action, detail) values (uid, p_action, p_value);
  return json_build_object('action', p_action);
end;
$$;

-- ---------------------------------------------------------------- the new scale
-- Straight lines through (100, 100), (500, 460), (1000, 830), (2000, 1330), (3000, 1610), up to
-- 1700: fitted to young accounts in the simulation and kept low, so nobody lands above where they
-- would settle. Old floors land in the same rank position: 600 → 534 (Apprentice), 1200 → 930
-- (Adept), 2000 → 1330 (Archmage, 4th), 3000 → 1610 (Elomental, the top).
create function private.ladder_v2(old integer) returns integer
language sql immutable set search_path = '' as $$
  select case
    when old is null then null
    when old <= 100 then old
    when old <= 500 then round(100 + 0.9 * (old - 100))
    when old <= 1000 then round(460 + 0.74 * (old - 500))
    when old <= 2000 then round(830 + 0.5 * (old - 1000))
    when old <= 3000 then round(1330 + 0.28 * (old - 2000))
    else least(round(1610 + 0.05 * (old - 3000)), 1700)
  end::integer;
$$;

update public.games set elo_before = private.ladder_v2(elo_before), elo_after = private.ladder_v2(elo_after)
  where mode = 'ranked' and (elo_before is not null or elo_after is not null);
update public.profiles set elo = private.ladder_v2(elo), rank_tier = private.shown_tier(0::smallint, private.ladder_v2(elo));
drop function private.ladder_v2(integer);

revoke execute on all functions in schema private from public, anon, authenticated;

select private.refresh_lb();
