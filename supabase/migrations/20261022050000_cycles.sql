-- Cycles: the faction month and the Ranked season, settled and opened by one scheduler
-- (docs/WIPE_SYSTEM.md; the owner, 2026-10-22). Nothing is deleted: influence is kept per
-- month, each closed season is written to season_results, and the next season is a new row.
--
-- * cycle_config: season length (1 to 12 months, for the next season opened), the Elo reset
--   (soft by default: 40% of the Elo above 100 kept; an optional one-rank floor), the
--   season badge's games and wins, the faction prize, and hold_until to postpone everything.
-- * close_season: one transaction: snapshot every Ranked player's season, grant the season
--   badge for the highest rank won 3 times (20 Ranked games per 6 months of season), reset
--   their Elo, open the next season. Players who didn't play Ranked keep their Elo.
--   Idempotent; a dry run returns who gets what.
-- * run_cycles (hourly cron): every unsettled past month oldest first, then every ended
--   season, each in its own savepoint, logged in cycle_runs.
-- * cycle_info, cycle_news, cycle_news_seen: countdowns and "While you were away".
-- * current_season is the latest season started (not 0 between an end and its close), and
--   the parts on offer follow parts_season, the newest season that has parts.

-- ---------------------------------------------------------------- seasons
alter table public.seasons
  add column name text,
  add column closed_at timestamptz;
update public.seasons set name = 'Alpha' where id = 0;

-- The latest season started (before its close too: a season's end and its close are an
-- hour apart at most, and the Season board and the faction switch stay with it till then).
create or replace function private.current_season() returns smallint
language sql stable set search_path = '' as $$
  select coalesce((select id from public.seasons where starts_at <= now() order by starts_at desc limit 1), 0)::smallint;
$$;

-- The parts on offer: the newest season that has parts (a season can open before its art).
create function private.parts_season() returns smallint
language sql stable set search_path = '' as $$
  select coalesce((select max(season_id) from public.parts where season_id <= private.current_season()), 0)::smallint;
$$;

-- A season opened at p_start ends on the 1st, p_months whole months after p_start's month.
create function private.season_end_for(p_start timestamptz, p_months integer) returns timestamptz
language sql immutable set search_path = '' as $$
  select (date_trunc('month', p_start at time zone 'UTC') + make_interval(months => p_months)) at time zone 'UTC';
$$;

-- ---------------------------------------------------------------- config and log
create table private.cycle_config (
  id boolean primary key default true check (id),
  season_months smallint not null default 6 check (season_months between 1 and 12),
  elo_reset text not null default 'soft' check (elo_reset in ('soft', 'hard', 'keep')),
  elo_start integer not null default 100 check (elo_start >= 0),
  -- the owner's call (2026-10-22): a firm reset, 40% of the Elo above the start kept
  elo_keep numeric not null default 0.4 check (elo_keep between 0 and 1),
  -- on: a soft reset never drops a player more than one rank (off by the owner's call)
  elo_floor_one_rank boolean not null default false,
  -- per 6 months of season: a shorter season asks for proportionally fewer
  season_badge_games integer not null default 20 check (season_badge_games >= 0),
  -- the season badge's rank needs this many Ranked wins at that rank or higher (not one lucky peak)
  season_badge_wins integer not null default 3 check (season_badge_wins >= 1),
  faction_win_stardust integer not null default 300 check (faction_win_stardust >= 0),
  faction_win_solves integer not null default 5 check (faction_win_solves >= 0),
  hold_until timestamptz
);
insert into private.cycle_config default values;
alter table private.cycle_config enable row level security;
revoke all on private.cycle_config from public, anon, authenticated;

create table private.cycle_runs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('faction', 'season', 'hold')),
  ref text not null,
  status text not null check (status in ('done', 'skipped', 'failed')),
  detail text
);
alter table private.cycle_runs enable row level security;
revoke all on private.cycle_runs from public, anon, authenticated;

-- A player's season, kept for good (PERMANENT): the history, the hall of fame and the undo.
create table public.season_results (
  season_id smallint not null references public.seasons (id),
  player_id uuid not null references public.profiles (id) on delete cascade,
  final_elo integer not null,
  elo_after integer not null,
  best_elo integer,
  best_tier smallint,
  games integer not null,
  place integer,
  badge text references public.badges (id),
  primary key (season_id, player_id)
);
alter table public.season_results enable row level security;
create policy "Players read their seasons" on public.season_results
  for select to authenticated using ((select auth.uid()) = player_id);
revoke insert, update, delete, truncate on public.season_results from anon, authenticated;

-- When the player last saw "While you were away" (new players have nothing to catch up on).
alter table public.profiles add column news_seen_at timestamptz not null default now();

-- ---------------------------------------------------------------- the parts season
-- As in economy_pace, with the newest season that has parts.
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

  -- a part you don't have is much likelier than one you own, and your own element's favoured
  select pt.id into v_part from public.parts pt
    where pt.rarity = v_rarity and pt.source = 'craft' and pt.season_id = private.parts_season()
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
    'guarantee', json_build_object('epic', 10 - p.pity_epic, 'mythic', 25 - p.pity_mythic),
    -- every part of that rarity owned: its next drop can only be Stardust
    'complete', (select json_object_agg(r, not exists (
        select 1 from public.parts pt
        where pt.rarity = r and pt.source = 'craft' and pt.season_id = private.parts_season()
          and not exists (select 1 from public.player_parts pp where pp.player_id = p_player and pp.part_id = pt.id)))
      from unnest(array['epic', 'mythic']) as r));
end;
$$;

-- As in review_integrity, with the newest season that has parts.
create or replace function public.forge_part(p_part text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  pt public.parts;
  cost integer;
  ed integer;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into pt from public.parts where id = p_part for update;   -- also numbers editions in order
  if not found or pt.source <> 'craft' then raise exception 'not_forgeable'; end if;
  if pt.season_id is distinct from private.parts_season() then raise exception 'vaulted'; end if;
  if exists (select 1 from public.player_parts where player_id = uid and part_id = p_part) then
    raise exception 'already_owned';
  end if;
  cost := private.forge_cost(pt.rarity);
  update public.profiles set stardust = stardust - cost where id = uid and stardust >= cost;
  if not found then raise exception 'not_enough_stardust'; end if;
  -- first editions: the first 100 forges of a Mythic part are numbered (test accounts don't
  -- count and get no number)
  if not (select test_account from public.profiles where id = uid) then
    if pt.rarity = 'mythic' and pt.editions_forged < 100 then ed := pt.editions_forged + 1; end if;
    update public.parts set editions_forged = editions_forged + 1 where id = p_part;
  end if;
  insert into public.player_parts (player_id, part_id, how, edition) values (uid, p_part, 'forge', ed);
  insert into private.ledger (player_id, reason, ref, stardust) values (uid, 'forge', p_part, -cost);
  return json_build_object('part', p_part, 'edition', ed);
end;
$$;

-- ---------------------------------------------------------------- the faction month
-- As in review_integrity, its prize from the config.
create or replace function private.settle_faction_month(p_month date) returns text
language plpgsql security definer set search_path = '' as $$
declare
  wins text[];
  w text;
  c private.cycle_config;
begin
  if exists (select 1 from public.faction_months where month = p_month) then
    return (select winner from public.faction_months where month = p_month);
  end if;
  select * into c from private.cycle_config;
  select array_agg(s.affinity order by s.affinity) into wins from private.standings(p_month) s
    where s.members > 0 and s.standing = (select max(x.standing) from private.standings(p_month) x where x.members > 0);
  insert into public.faction_months (month, winner, winners) values (p_month, wins[1], wins);
  if wins is null then return null; end if;
  foreach w in array wins loop
    insert into public.badges (id, source) values ('win-' || to_char(p_month, 'YYYY-MM') || '-' || w, 'earned') on conflict do nothing;
    with helped as (
      select a.player_id from public.affinity_months a join public.profiles p on p.id = a.player_id
      where a.month = p_month and a.affinity = w and a.influence > 0 and a.solves >= c.faction_win_solves and not p.test_account
    ), badged as (
      insert into public.player_badges (player_id, badge)
        select player_id, 'win-' || to_char(p_month, 'YYYY-MM') || '-' || w from helped
        on conflict do nothing
        returning player_id
    ), paid as (
      update public.profiles p set stardust = p.stardust + c.faction_win_stardust from badged b where p.id = b.player_id returning p.id
    )
    insert into private.ledger (player_id, reason, ref, stardust)
      select id, 'faction_win', to_char(p_month, 'YYYY-MM') || '-' || w, c.faction_win_stardust from paid;
  end loop;
  return wins[1];
end;
$$;

-- ---------------------------------------------------------------- the season
-- Snapshot, badges, Elo reset, next season: all or nothing. A closed season returns at once;
-- p_dry_run returns the same summary and writes nothing.
create function private.close_season(p_season smallint, p_now timestamptz default now(), p_dry_run boolean default false) returns json
language plpgsql security definer set search_path = '' as $$
declare
  s public.seasons;
  c private.cycle_config;
  names text[] := array['novice', 'apprentice', 'adept', 'archmage', 'elomental'];
  summary json;
  next_id smallint;
  need integer;
begin
  -- the row lock: a second run waits here, then finds the season closed
  select * into s from public.seasons where id = p_season for update;
  if not found then raise exception 'no_season'; end if;
  if s.closed_at is not null then return json_build_object('season', p_season, 'already', true); end if;
  if not p_dry_run and s.ends_at > p_now then raise exception 'not_ended'; end if;
  select * into c from private.cycle_config;
  -- Every profile held still while Elo is read and reset: a Ranked game finishing now waits
  -- and lands after the reset, never in between (or its result would be overwritten).
  -- (finish_game locks a game then its profile; this never locks games: no deadlock.)
  if not p_dry_run then lock table public.profiles in share row exclusive mode; end if;
  -- the badge's games, in proportion to the season's length (20 per 6 months by default)
  need := ceil(c.season_badge_games * greatest(1, round(extract(epoch from (s.ends_at - s.starts_at)) / (30.44 * 86400))) / 6.0)::integer;

  create temp table results on commit drop as
  with season_games as (
    select g.user_id, g.won, g.elo_after
      from public.games g
     where g.mode = 'ranked' and g.elo_after is not null
       and g.finished_at >= greatest(s.starts_at, coalesce((select r.at from private.season_resets r where r.user_id = g.user_id), s.starts_at))
       and g.finished_at < s.ends_at
  ), per_player as (
    select user_id, count(*)::integer as games, max(elo_after) as best,
           -- the highest rank won at least season_badge_wins times
           (select max(t) from generate_series(0, 4) t
             where (select count(*) from season_games w where w.user_id = sg.user_id and w.won
                      and private.shown_tier(0::smallint, w.elo_after) >= t) >= c.season_badge_wins) as held_tier
      from season_games sg group by user_id
  ), players as (
    -- only players who played Ranked this season: one away keeps their Elo
    select p.id, p.elo, p.rank_tier, p.test_account, pp.games, pp.best, pp.held_tier,
           -- listed on the Season board (as the board's snapshot decides)
           not p.test_account and not coalesce(u.is_anonymous, false) and not p.lb_hidden
             and not private.ranked_restricted(p.id) and pp.games >= need as listed
      from public.profiles p join per_player pp on pp.user_id = p.id join auth.users u on u.id = p.id
  )
  select pl.id as player_id, pl.elo as final_elo, pl.games, pl.best as best_elo,
         coalesce(pl.held_tier, 0)::smallint as best_tier,
         case when pl.games >= need and not pl.test_account
              then 'season-' || p_season || '-' || names[coalesce(pl.held_tier, 0) + 1] end as badge,
         least(pl.elo, case c.elo_reset
           when 'keep' then pl.elo
           when 'hard' then c.elo_start
           else greatest(c.elo_start + round((pl.elo - c.elo_start) * c.elo_keep)::integer,
                         -- never more than one rank down
                         case when c.elo_floor_one_rank then (private.tier_floors())[greatest(pl.rank_tier - 1, 0) + 1] else 0 end)
         end) as elo_after,
         case when pl.listed then rank() over (partition by pl.listed order by pl.best desc) end::integer as place
    from players pl;

  select json_build_object(
    'season', p_season,
    'dryRun', p_dry_run,
    'players', (select count(*) from results),
    'badges', (select count(*) from results where badge is not null),
    'rows', coalesce((select json_agg(json_build_object(
        'id', r.player_id, 'name', p.display_name, 'games', r.games, 'bestElo', r.best_elo, 'badge', r.badge,
        'place', r.place, 'elo', r.final_elo, 'eloAfter', r.elo_after) order by r.place nulls last, r.final_elo desc)
      from results r join public.profiles p on p.id = r.player_id), '[]'::json))
  into summary;
  if p_dry_run then
    drop table results;
    return summary;
  end if;

  -- 1. the history (permanent)
  insert into public.season_results (season_id, player_id, final_elo, elo_after, best_elo, best_tier, games, place, badge)
    select p_season, player_id, final_elo, elo_after, best_elo, best_tier, games, place, null from results;
  -- 2. the rewards (permanent)
  insert into public.badges (id, source) select distinct badge, 'earned' from results where badge is not null on conflict do nothing;
  insert into public.player_badges (player_id, badge) select player_id, badge from results where badge is not null on conflict do nothing;
  update public.season_results sr set badge = r.badge from results r
    where sr.season_id = p_season and sr.player_id = r.player_id and r.badge is not null;
  -- 3. the reset
  update public.profiles p set elo = r.elo_after, rank_tier = private.shown_tier(0::smallint, r.elo_after), ranked_loss_run = 0
    from results r where p.id = r.player_id;
  -- 4. the next season
  update public.seasons set closed_at = p_now where id = p_season;
  next_id := p_season + 1;
  insert into public.seasons (id, starts_at, ends_at)
    values (next_id, s.ends_at, private.season_end_for(s.ends_at, c.season_months))
    on conflict (id) do nothing;
  drop table results;
  perform private.refresh_lb();
  return summary;
end;
$$;

-- Moves a season's end (postpone, or end it now for a manual close). Closed seasons can't.
create function private.set_season_end(p_season smallint, p_ends timestamptz) returns text
language plpgsql security definer set search_path = '' as $$
begin
  update public.seasons set ends_at = p_ends where id = p_season and closed_at is null and starts_at < p_ends;
  if not found then raise exception 'not_open_or_bad_date'; end if;
  -- an opened next season starts where this one now ends
  update public.seasons n set starts_at = p_ends, ends_at = greatest(n.ends_at, private.season_end_for(p_ends, 1))
    where n.id = p_season + 1 and n.closed_at is null;
  return 'Season ' || p_season || ' ends ' || p_ends;
end;
$$;

-- Undoes a close: Elo back by the reset's amount (keeping any change since), its badges and
-- history gone, the next season gone, the season open again. Put a hold on first, or the next
-- hourly run closes it again.
create function private.reopen_season(p_season smallint) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.seasons where id = p_season and closed_at is not null for update;
  if not found then raise exception 'not_closed'; end if;
  if exists (select 1 from public.seasons where id = p_season + 1 and closed_at is not null) then raise exception 'next_closed'; end if;
  update public.profiles p set elo = p.elo + (r.final_elo - r.elo_after),
    rank_tier = private.shown_tier(0::smallint, p.elo + (r.final_elo - r.elo_after))
    from public.season_results r where r.season_id = p_season and r.player_id = p.id;
  delete from public.player_badges where badge like 'season-' || p_season || '-%';
  delete from public.season_results where season_id = p_season;
  delete from public.seasons where id = p_season + 1;
  update public.seasons set closed_at = null where id = p_season;
  perform private.refresh_lb();
  return 'Season ' || p_season || ' is open again';
end;
$$;

-- ---------------------------------------------------------------- the scheduler
-- Every unsettled past month (oldest first), then every ended season. Each step in its own
-- savepoint: one failing is logged and retried next hour, the others still happen.
create function private.run_cycles(p_now timestamptz default now()) returns json
language plpgsql security definer set search_path = '' as $$
declare
  hold timestamptz := (select hold_until from private.cycle_config);
  m date;
  sid smallint;
  done integer := 0;
  failed integer := 0;
begin
  if hold is not null and hold > p_now then
    insert into private.cycle_runs (kind, ref, status, detail) values ('hold', to_char(hold, 'YYYY-MM-DD HH24:MI'), 'skipped', 'held');
    return json_build_object('held', hold);
  end if;
  for m in select distinct a.month from public.affinity_months a
            where a.month < date_trunc('month', p_now at time zone 'UTC')::date
              and not exists (select 1 from public.faction_months f where f.month = a.month)
            order by a.month loop
    begin
      perform private.settle_faction_month(m);
      insert into private.cycle_runs (kind, ref, status) values ('faction', to_char(m, 'YYYY-MM'), 'done');
      done := done + 1;
    exception when others then
      insert into private.cycle_runs (kind, ref, status, detail) values ('faction', to_char(m, 'YYYY-MM'), 'failed', sqlerrm);
      failed := failed + 1;
    end;
  end loop;
  for sid in select id from public.seasons where ends_at <= p_now and closed_at is null order by id loop
    begin
      perform private.close_season(sid, p_now, false);
      insert into private.cycle_runs (kind, ref, status) values ('season', sid::text, 'done');
      done := done + 1;
    exception when others then
      insert into private.cycle_runs (kind, ref, status, detail) values ('season', sid::text, 'failed', sqlerrm);
      failed := failed + 1;
    end;
  end loop;
  return json_build_object('done', done, 'failed', failed);
end;
$$;

-- ---------------------------------------------------------------- what the app reads
-- The server's time, this month and this season, for the countdowns (stored and computed in UTC).
create function public.cycle_info() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'now', now(),
    'month', json_build_object(
      'startsAt', date_trunc('month', now() at time zone 'UTC') at time zone 'UTC',
      'endsAt', (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC'),
    'season', (select json_build_object('id', s.id, 'name', s.name, 'startsAt', s.starts_at, 'endsAt', s.ends_at)
                 from public.seasons s where s.id = private.current_season()));
$$;

-- "While you were away": seasons closed and months settled since the player last looked.
create function public.cycle_news() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  seen timestamptz;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  select news_seen_at into seen from public.profiles where id = me;
  return json_build_object(
    'seasons', coalesce((select json_agg(json_build_object(
        'id', s.id, 'name', s.name, 'games', r.games, 'bestTier', r.best_tier, 'badge', r.badge,
        'place', r.place, 'elo', r.final_elo, 'eloAfter', r.elo_after) order by s.id)
      from public.season_results r join public.seasons s on s.id = r.season_id
      where r.player_id = me and s.closed_at > seen), '[]'::json),
    'months', coalesce((select json_agg(json_build_object(
        'month', f.month, 'side', a.affinity, 'won', a.affinity = any (coalesce(f.winners, array[f.winner])),
        'badge', exists (select 1 from public.player_badges b where b.player_id = me
                          and b.badge = 'win-' || to_char(f.month, 'YYYY-MM') || '-' || a.affinity)) order by f.month)
      from public.faction_months f join public.affinity_months a on a.month = f.month and a.player_id = me
      where f.settled_at > seen and a.influence > 0), '[]'::json));
end;
$$;

create function public.cycle_news_seen() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set news_seen_at = now() where id = auth.uid();
$$;

-- ---------------------------------------------------------------- schedule (live and beta)
do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if exists (select 1 from cron.job where jobname = 'faction-settle') then
      perform cron.unschedule('faction-settle');
    end if;
    perform cron.schedule('cycles', '5 * * * *', 'select private.run_cycles()');
  end if;
end
$do$;

-- ---------------------------------------------------------------- grants
revoke execute on function public.cycle_info(), public.cycle_news(), public.cycle_news_seen() from public, anon;
grant execute on function public.cycle_info(), public.cycle_news(), public.cycle_news_seen() to authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
