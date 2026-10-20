-- Show founders to players (Dev mode switch, the owner's request 2026-10-20).
-- Founder accounts are test accounts once dev mode has been on (review_integrity, H2): kept off
-- the leaderboard, search, follows and other players' view of their card. One switch, for all
-- founders, now lets players see them again. Seen, not competing: a test account still earns no
-- influence, no month-win reward and no numbered edition, so dev-made solves never move the
-- affinity war or a prize (finish_game, settle_faction_month and forge_part are unchanged).

-- the snapshot rebuild below locks a busy table: give up rather than queue behind a long refresh
set local lock_timeout = '5s';

-- ---------------------------------------------------------------- the switch
create table private.app_flags (
  name text primary key,
  enabled boolean not null default false
);
alter table private.app_flags enable row level security;
revoke all on private.app_flags from public, anon, authenticated;
insert into private.app_flags (name, enabled) values ('show_founders', false);

-- Whether an account with this test flag is visible to other players right now.
create function private.shown(p_test_account boolean) returns boolean
language sql stable set search_path = '' as $$
  select not p_test_account
      or coalesce((select enabled from private.app_flags where name = 'show_founders'), false);
$$;

-- ---------------------------------------------------------------- the snapshot
-- As in leaderboard_paging_season, with private.shown() in place of "not p.test_account".
-- (A materialized view can't be replaced in place: dropped with lb_row, then rebuilt.)
drop materialized view private.lb cascade;
create materialized view private.lb as
with players as (
  select p.id, p.display_name, p.elo, p.ranked_games, p.title, p.plate, p.affinity, p.country,
         l.avatar, l.frame,
         coalesce((select pp.polish = 1 from public.player_parts pp where pp.player_id = p.id and pp.part_id = l.avatar), false) as alive,
         s.best as season_best,
         coalesce(s.games, 0) as season_games
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.avatar_loadouts l on l.player_id = p.id
  -- this season's Ranked games: how many, and the best Elo after one
  left join lateral (
    select count(*)::integer as games, max(g.elo_after) as best
    from public.games g
    where g.user_id = p.id and g.mode = 'ranked' and g.finished_at >= private.season_since(p.id) and g.elo_after is not null
  ) s on true
  where p.ranked_games > 0 and not coalesce(u.is_anonymous, false) and not p.lb_hidden and private.shown(p.test_account)
    and not private.ranked_restricted(p.id)
)
select *,
  -- the place shown (ties share it) ...
  rank() over (order by elo desc) as global_rank,
  case when affinity is not null then rank() over (partition by affinity order by elo desc) end as faction_rank,
  case when country is not null then rank() over (partition by country order by elo desc) end as country_rank,
  case when season_games >= 20 then rank() over (partition by season_games >= 20 order by season_best desc) end as season_rank,
  -- ... and the position pages and windows count by (one per player, ties broken by id)
  row_number() over (order by elo desc, id) as global_pos,
  case when affinity is not null then row_number() over (partition by affinity order by elo desc, id) end as faction_pos,
  case when country is not null then row_number() over (partition by country order by elo desc, id) end as country_pos,
  case when season_games >= 20 then row_number() over (partition by season_games >= 20 order by season_best desc, id) end as season_pos
from players;
create unique index lb_id on private.lb (id);
create index lb_global on private.lb (global_pos);
create index lb_faction on private.lb (affinity, faction_pos);
create index lb_country on private.lb (country, country_pos);
create index lb_season on private.lb (season_pos);
revoke all on private.lb from public, anon, authenticated;

create function private.lb_row(r private.lb, place bigint, value integer, me uuid) returns json
language sql stable set search_path = '' as $$
  select json_build_object('place', place, 'id', r.id, 'name', r.display_name, 'title', r.title, 'elo', r.elo,
    'value', value, 'plate', r.plate, 'avatar', r.avatar, 'frame', r.frame, 'alive', r.alive,
    'affinity', r.affinity, 'country', r.country, 'me', r.id = me);
$$;
-- lb_place and lb_pos hold a private.lb row in a variable: touching them makes every session
-- recompile them against the rebuilt snapshot (else "cache lookup failed for type" in pooled ones)
alter function private.lb_place(text, text, uuid) set search_path = '';
alter function private.lb_pos(text, text, uuid) set search_path = '';

-- ---------------------------------------------------------------- live checks
-- L1: still listable right now (the snapshot can be up to 5 minutes old)
create or replace function private.lb_visible(p_player uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p_player and not lb_hidden and private.shown(test_account))
     and not private.ranked_restricted(p_player);
$$;

-- search: test accounts only while founders are shown; restricted players show without a place
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
      select p.id, p.display_name as name, p.elo, p.title, p.plate, l.avatar, l.frame,
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

-- cards: as in leaderboard_paging_season; a test account's card opens while founders are shown
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
    'id', p.id, 'name', p.display_name, 'title', p.title, 'elo', p.elo, 'plate', p.plate,
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

create or replace function public.follow(p_player uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if p_player = me then raise exception 'bad_request'; end if;
  if not exists (select 1 from public.profiles p join auth.users u on u.id = p.id
                 where p.id = p_player and not coalesce(u.is_anonymous, false) and not p.lb_hidden and private.shown(p.test_account)) then
    raise exception 'no_player';
  end if;
  if (select count(*) from public.follows where follower = me) >= 500 then raise exception 'too_many_follows'; end if;
  insert into public.follows (follower, followee) values (me, p_player) on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------- the founders' switch
-- Founders with their code only (dev mode itself needn't be on). Logged, and the snapshot is
-- refreshed so the leaderboard follows at once.
create function public.dev_show_founders(p_on boolean) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not private.is_admin(uid) then raise exception 'not_admin'; end if;
  update private.app_flags set enabled = coalesce(p_on, false)
    where name = 'show_founders' and enabled is distinct from coalesce(p_on, false);
  -- already as asked: nothing to log or refresh
  if not found then return json_build_object('shown', coalesce(p_on, false)); end if;
  insert into private.founder_log (founder_id, action)
    values (uid, case when coalesce(p_on, false) then 'show_founders' else 'hide_founders' end);
  perform private.refresh_lb();
  return json_build_object('shown', coalesce(p_on, false));
end;
$$;

create function public.founders_shown() returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin(auth.uid()) then raise exception 'not_admin'; end if;
  return coalesce((select enabled from private.app_flags where name = 'show_founders'), false);
end;
$$;

revoke execute on function public.dev_show_founders(boolean) from public, anon;
revoke execute on function public.founders_shown() from public, anon;
grant execute on function public.dev_show_founders(boolean) to authenticated;
grant execute on function public.founders_shown() to authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

select private.refresh_lb();
