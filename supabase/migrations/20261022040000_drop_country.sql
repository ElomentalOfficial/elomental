-- No more countries (the owner, 2026-10-22): with few players a country list stays empty, so
-- the Country list, the country choice and the country on player cards are gone (the app
-- dropped them in the same change). Here: the leaderboard snapshot is rebuilt without
-- country, the functions reading it are as before minus country, set_country goes, and so
-- does profiles.country (two players had chosen one). A 'country' view is now refused like
-- any unknown view.

-- the snapshot rebuild below locks a busy table: give up rather than queue behind a long refresh
set local lock_timeout = '5s';

-- ---------------------------------------------------------------- the snapshot
-- As in show_founders, without country, country_rank and country_pos. (A materialized view
-- can't be replaced in place: dropped with lb_row, which takes its row, then rebuilt.)
drop materialized view private.lb cascade;
create materialized view private.lb as
with players as (
  select p.id, p.display_name, p.elo, p.ranked_games, p.title, p.plate, p.affinity,
         l.avatar, l.frame,
         coalesce((select pp.polish = 1 from public.player_parts pp where pp.player_id = p.id and pp.part_id = l.avatar), false) as alive,
         s.best as season_best,
         coalesce(s.games, 0) as season_games
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.avatar_loadouts l on l.player_id = p.id
    left join lateral (
      select count(*)::integer as games, max(g.elo_after) as best
        from public.games g
       where g.user_id = p.id and g.mode = 'ranked' and g.finished_at >= private.season_since(p.id) and g.elo_after is not null
    ) s on true
   where p.ranked_games > 0 and not coalesce(u.is_anonymous, false) and not p.lb_hidden
     and private.shown(p.test_account) and not private.ranked_restricted(p.id)
)
select id, display_name, elo, ranked_games, title, plate, affinity, avatar, frame, alive, season_best, season_games,
       rank() over (order by elo desc) as global_rank,
       case when affinity is not null then rank() over (partition by affinity order by elo desc) end as faction_rank,
       case when season_games >= 20 then rank() over (partition by (season_games >= 20) order by season_best desc) end as season_rank,
       row_number() over (order by elo desc, id) as global_pos,
       case when affinity is not null then row_number() over (partition by affinity order by elo desc, id) end as faction_pos,
       case when season_games >= 20 then row_number() over (partition by (season_games >= 20) order by season_best desc, id) end as season_pos
  from players;
create unique index lb_id on private.lb (id);
create index lb_global on private.lb (global_pos);
create index lb_faction on private.lb (affinity, faction_pos);
create index lb_season on private.lb (season_pos);
revoke all on private.lb from public, anon, authenticated;

-- ---------------------------------------------------------------- reading it
create function private.lb_row(r private.lb, place bigint, value integer, me uuid) returns json
language sql stable set search_path = '' as $$
  select json_build_object('place', place, 'id', r.id, 'name', r.display_name, 'title', r.title, 'elo', r.elo,
    'tier', (select rank_tier from public.profiles where id = r.id),
    'value', value, 'plate', r.plate, 'avatar', r.avatar, 'frame', r.frame, 'alive', r.alive,
    'affinity', r.affinity, 'me', r.id = me);
$$;

create or replace function private.lb_scope(p_view text, p_scope text, me uuid) returns text
language sql stable set search_path = '' as $$
  select case p_view
    when 'faction' then coalesce(p_scope, (select affinity from public.profiles where id = me))
  end;
$$;

create or replace function private.lb_range(p_view text, p_scope text, p_from bigint, p_to bigint, me uuid) returns json
language plpgsql stable set search_path = '' as $$
declare
  out json;
begin
  if p_view = 'global' then
    select json_agg(private.lb_row(r, r.global_rank, r.elo, me) order by r.global_pos) into out
      from private.lb r where r.global_pos between p_from and p_to and private.lb_visible(r.id);
  elsif p_view = 'season' then
    select json_agg(private.lb_row(r, r.season_rank, r.season_best, me) order by r.season_pos) into out
      from private.lb r where r.season_pos between p_from and p_to and private.lb_visible(r.id);
  elsif p_view = 'faction' then
    select json_agg(private.lb_row(r, r.faction_rank, r.elo, me) order by r.faction_pos) into out
      from private.lb r where r.affinity = p_scope and r.faction_pos between p_from and p_to and private.lb_visible(r.id);
  elsif p_view = 'friends' then
    -- who you follow, and you: small (at most 501), ranked and numbered on the spot
    select json_agg(private.lb_row(f.r, f.place, (f.r).elo, me) order by f.pos) into out
      from (select r, rank() over (order by r.elo desc) as place, row_number() over (order by r.elo desc, r.id) as pos
            from private.lb r
            where (r.id = me or r.id in (select followee from public.follows where follower = me)) and private.lb_visible(r.id)) f
      where f.pos between p_from and p_to;
  else
    raise exception 'bad_request';
  end if;
  return coalesce(out, '[]'::json);
end;
$$;

create or replace function private.lb_place(p_view text, p_scope text, me uuid) returns bigint
language plpgsql stable set search_path = '' as $$
declare
  r private.lb;
  p public.profiles;
begin
  select * into r from private.lb where id = me;
  select * into p from public.profiles where id = me;
  if p_view = 'global' then
    return coalesce(r.global_rank, case when p.ranked_games > 0 then 1 + (select count(*) from private.lb where elo > p.elo) end);
  elsif p_view = 'faction' then
    if p.affinity is distinct from p_scope then return null; end if;
    return coalesce(case when r.affinity = p_scope then r.faction_rank end,
      case when p.ranked_games > 0 then 1 + (select count(*) from private.lb where affinity = p_scope and elo > p.elo and id <> me) end);
  elsif p_view = 'season' then
    return r.season_rank;
  elsif p_view = 'friends' then
    if p.ranked_games = 0 then return null; end if;
    return 1 + (select count(*) from private.lb l
                where l.id in (select followee from public.follows where follower = me) and l.elo > p.elo
                  and private.lb_visible(l.id));
  end if;
  return null;
end;
$$;

create or replace function private.lb_pos(p_view text, p_scope text, me uuid) returns bigint
language plpgsql stable set search_path = '' as $$
declare
  r private.lb;
begin
  select * into r from private.lb where id = me;
  if r.id is not null then
    if p_view = 'global' then return r.global_pos;
    elsif p_view = 'faction' and r.affinity = p_scope then return r.faction_pos;
    elsif p_view = 'season' then return r.season_pos;
    elsif p_view = 'friends' then
      -- numbered exactly as lb_range numbers them
      return (select f.pos from (select l.id, row_number() over (order by l.elo desc, l.id) as pos from private.lb l
                                 where (l.id = me or l.id in (select followee from public.follows where follower = me))
                                   and private.lb_visible(l.id)) f
              where f.id = me);
    end if;
  end if;
  return private.lb_place(p_view, p_scope, me);
end;
$$;

create or replace function private.lb_total(p_view text, p_scope text, me uuid) returns bigint
language sql stable set search_path = '' as $$
  select case p_view
    when 'global' then (select n from private.lb_meta where key = 'global')
    when 'season' then (select n from private.lb_meta where key = 'season')
    when 'faction' then (select n from private.lb_meta where key = 'faction:' || p_scope)
    when 'friends' then (select count(*) from private.lb where id = me or id in (select followee from public.follows where follower = me))
  end;
$$;

create or replace function private.refresh_lb() returns void
language plpgsql security definer set search_path = '' as $$
declare
  f integer[] := private.tier_floors();
begin
  refresh materialized view concurrently private.lb;
  -- every row (an explicit WHERE: API calls refuse a bare DELETE)
  delete from private.lb_meta where true;
  insert into private.lb_meta (key, n)
    select 'global', count(*) from private.lb
    union all select 'season', count(*) from private.lb where season_rank is not null
    union all select 'faction:' || affinity, count(*) from private.lb where affinity is not null group by affinity
    union all select 'tier:' || f[i], (select count(*) from private.lb l join public.profiles p on p.id = l.id where p.rank_tier = i - 1)
      from generate_subscripts(f, 1) i;
end;
$$;

-- ---------------------------------------------------------------- the card
-- As in account_level, without the country.
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
    'level', (private.xp_level(p.xp)).level,
    'avatar', l.avatar, 'frame', l.frame,
    'alive', coalesce((select polish = 1 from public.player_parts where player_id = p_player and part_id = coalesce(l.avatar, 's0-avatar-happy')), false),
    'peak', greatest(p.elo, coalesce((select max(elo_after) from public.games where user_id = p_player and elo_after is not null), 0)),
    'place', (select global_rank from private.lb where id = p_player),
    'position', (select global_pos from private.lb where id = p_player),
    'notRanked', private.ranked_restricted(p_player),
    'affinity', p.affinity,
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

-- ---------------------------------------------------------------- the country itself
drop function public.set_country(text);
delete from private.lb_meta where key like 'country:%';
alter table public.profiles drop column country;

revoke execute on all functions in schema private from public, anon, authenticated;
select private.refresh_lb();
