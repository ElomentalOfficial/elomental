-- Full review, batch B8 (docs/FULL_REVIEW.md M5, M7; decision D8 default, approved 2026-10-20):
--
-- * M7  Ties no longer break paging or "around me". Pages and windows were ranges of rank(),
--       so 300 players tied at 100 Elo made one page of 310 rows and five empty ones. Each
--       view now also has a position (row_number(), ties broken by id): pages and windows
--       are ranges of positions; the place shown is still the rank.
-- * M5  The Season board ranks the best Elo reached this season, from 20 Ranked games this
--       season (D8), instead of Elo gained (which ranked new accounts climbing from 100).
-- * The show-off card also gives the player's position, so "Show on the leaderboard" opens
--   the right page when places are tied.
--
-- * A Ranked restriction starts the player's season again: games before it count for neither
--   the best Elo nor the 20, so a peak reached by copying can't come back when it ends.
--
-- Data: a new table private.season_resets (filled from current restrictions); the snapshot
-- is rebuilt. Undo: a later migration recreating the snapshot and functions from leaderboard
-- and review_integrity, and dropping season_resets and its trigger.

-- ---------------------------------------------------------------- season resets
create table private.season_resets (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  at timestamptz not null
);
alter table private.season_resets enable row level security;
revoke all on private.season_resets from public, anon, authenticated;
insert into private.season_resets (user_id, at) select user_id, created_at from private.ranked_restrictions;

-- Every restriction (admin_moderate or restrict_ranked) records when it started; lifting it
-- keeps the record.
create function private.note_season_reset() returns trigger
language plpgsql set search_path = '' as $$
begin
  insert into private.season_resets (user_id, at) values (new.user_id, new.created_at)
    on conflict (user_id) do update set at = greatest(private.season_resets.at, excluded.at);
  return new;
end;
$$;
create trigger ranked_restrictions_season_reset after insert or update on private.ranked_restrictions
  for each row execute function private.note_season_reset();

-- Where a player's season starts: the season's start, or their last restriction if later.
create function private.season_since(p_player uuid) returns timestamptz
language sql stable set search_path = '' as $$
  select greatest(coalesce((select starts_at from public.seasons where id = private.current_season()), now()),
                  (select at from private.season_resets where user_id = p_player));
$$;

-- ---------------------------------------------------------------- the snapshot
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
  where p.ranked_games > 0 and not coalesce(u.is_anonymous, false) and not p.lb_hidden and not p.test_account
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

-- ---------------------------------------------------------------- rows, places and positions
-- A view's rows from position p_from to p_to (inclusive), best first; each shows its place.
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
  elsif p_view = 'country' then
    select json_agg(private.lb_row(r, r.country_rank, r.elo, me) order by r.country_pos) into out
      from private.lb r where r.country = p_scope and r.country_pos between p_from and p_to and private.lb_visible(r.id);
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

-- Your place in a view (what's shown): from the snapshot, or worked out live if you're not in
-- it (new, hidden, ranked since the last refresh, or moved to another side or country).
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
  elsif p_view = 'country' then
    if p.country is distinct from p_scope then return null; end if;
    return coalesce(case when r.country = p_scope then r.country_rank end,
      case when p.ranked_games > 0 then 1 + (select count(*) from private.lb where country = p_scope and elo > p.elo and id <> me) end);
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

-- Your position in a view (where your window is): from the snapshot, or the place if you're
-- not in it there (then nobody tied is you).
create function private.lb_pos(p_view text, p_scope text, me uuid) returns bigint
language plpgsql stable set search_path = '' as $$
declare
  r private.lb;
begin
  select * into r from private.lb where id = me;
  if r.id is not null then
    if p_view = 'global' then return r.global_pos;
    elsif p_view = 'faction' and r.affinity = p_scope then return r.faction_pos;
    elsif p_view = 'country' and r.country = p_scope then return r.country_pos;
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

-- You, 10 above and 10 below (by position, so a tie can't make the window huge).
create or replace function public.lb_around_me(p_view text, p_scope text default null) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  scope text := private.lb_scope(p_view, p_scope, auth.uid());
  place bigint;
  pos bigint;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  place := private.lb_place(p_view, scope, me);
  pos := private.lb_pos(p_view, scope, me);
  return json_build_object('view', p_view, 'scope', scope, 'place', place,
    'rows', case when pos is null then '[]'::json else private.lb_range(p_view, scope, greatest(pos - 10, 1), pos + 10, me) end,
    'listed', exists (select 1 from private.lb where id = me),
    'updated', (select max(at) from private.lb_meta));
end;
$$;

-- Your place and the view's size, for the pinned "You" bar (Season: your best this season).
create or replace function public.lb_me(p_view text, p_scope text default null) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  scope text := private.lb_scope(p_view, p_scope, auth.uid());
  p public.profiles;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  select * into p from public.profiles where id = me;
  return json_build_object('place', private.lb_place(p_view, scope, me), 'total', private.lb_total(p_view, scope, me),
    'scope', scope, 'elo', p.elo, 'rated', p.ranked_games > 0, 'hidden', p.lb_hidden,
    'restricted', private.ranked_restricted(me), 'listed', exists (select 1 from private.lb where id = me),
    'value', case when p_view = 'season' then (select season_best from private.lb where id = me) else p.elo end,
    -- counted live, so a game just played shows at once
    'seasonGames', (select count(*) from public.games g where g.user_id = me and g.mode = 'ranked'
                      and g.elo_after is not null and g.finished_at >= private.season_since(me)));
end;
$$;

select private.refresh_lb();

-- ---------------------------------------------------------------- the card gives the position too
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
  if (p.lb_hidden or p.test_account) and p_player <> me then return json_build_object('hidden', true); end if;
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

-- ---------------------------------------------------------------- grants
revoke execute on all functions in schema private from public, anon, authenticated;
