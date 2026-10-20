-- The leaderboard (docs/LEADERBOARD_DESIGN.md, agreed with the owner 2026-10-20).
--
-- * A ranking snapshot, private.lb, refreshed every 5 minutes (pg_cron): every rankable
--   player (registered, rated at least once, not hidden, not restricted by Review) with
--   their place globally, in their affinity, in their country, and by Elo gained this season.
--   Pages and "around me" windows are range reads on the place columns.
-- * Follows (one-way), an optional country, card privacy, and a showcase of three parts.
-- * Name search: prefix first, then similar names (pg_trgm), 30 searches a minute.
-- * The show-off card, with privacy applied.
-- * The monthly affinity result is settled on the 1st (pg_cron): the winner is recorded, and
--   every player who added influence to it gets a dated badge and 300 Stardust.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------- profile settings
alter table public.profiles
  -- ISO 3166 alpha-2, chosen by the player (null: no country, not in the Country view)
  add column country text check (country ~ '^[A-Z]{2}$'),
  -- left out of every list and search (the player still sees their own place)
  add column lb_hidden boolean not null default false,
  -- the stats line on the show-off card
  add column card_stats boolean not null default true,
  -- up to three owned parts shown on the card
  add column showcase text[] not null default '{}' check (cardinality(showcase) <= 3);

create index profiles_name_trgm on public.profiles using gin (lower(display_name) extensions.gin_trgm_ops);
create index profiles_name_prefix on public.profiles (lower(display_name) text_pattern_ops);
create index if not exists games_user_mode_finished on public.games (user_id, mode, finished_at);
create index if not exists affinity_months_board on public.affinity_months (month, affinity, influence desc);

-- ---------------------------------------------------------------- follows
create table public.follows (
  follower uuid not null references public.profiles (id) on delete cascade,
  followee uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index follows_followee on public.follows (followee);
alter table public.follows enable row level security;
create policy "Players read who they follow" on public.follows
  for select to authenticated using ((select auth.uid()) = follower);
revoke insert, update, delete, truncate on public.follows from anon, authenticated;

-- ---------------------------------------------------------------- badges and monthly results
create table public.player_badges (
  player_id uuid not null references public.profiles (id) on delete cascade,
  badge text not null,             -- e.g. 'win-2026-10-fire'
  earned_at timestamptz not null default now(),
  primary key (player_id, badge)
);
alter table public.player_badges enable row level security;
create policy "Players read their badges" on public.player_badges
  for select to authenticated using ((select auth.uid()) = player_id);
revoke insert, update, delete, truncate on public.player_badges from anon, authenticated;

create table public.faction_months (
  month date primary key,
  winner text check (winner in ('fire', 'water', 'earth', 'air')),
  settled_at timestamptz not null default now()
);
alter table public.faction_months enable row level security;
create policy "Everyone reads the monthly results" on public.faction_months for select to authenticated using (true);
revoke insert, update, delete, truncate on public.faction_months from anon, authenticated;

create table private.search_hits (
  player_id uuid not null,
  minute timestamptz not null,
  n integer not null default 0,
  primary key (player_id, minute)
);
alter table private.search_hits enable row level security;

-- ---------------------------------------------------------------- the ranking snapshot
create materialized view private.lb as
with season as (
  select coalesce((select starts_at from public.seasons where id = private.current_season()), now()) as starts_at
), players as (
  select p.id, p.display_name, p.elo, p.ranked_games, p.title, p.plate, p.affinity, p.country,
         l.avatar, l.frame,
         coalesce((select pp.polish = 1 from public.player_parts pp where pp.player_id = p.id and pp.part_id = l.avatar), false) as alive,
         -- Elo gained this season: now, minus before the first rated game of the season
         p.elo - coalesce((
           select g.elo_before from public.games g
           where g.user_id = p.id and g.mode = 'ranked' and g.finished_at >= (select starts_at from season) and g.elo_before is not null
           order by g.finished_at limit 1), p.elo) as season_gain
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.avatar_loadouts l on l.player_id = p.id
  where p.ranked_games > 0 and not coalesce(u.is_anonymous, false) and not p.lb_hidden
    and not private.ranked_restricted(p.id)
)
select *,
  rank() over (order by elo desc) as global_rank,
  case when affinity is not null then rank() over (partition by affinity order by elo desc) end as faction_rank,
  case when country is not null then rank() over (partition by country order by elo desc) end as country_rank,
  case when season_gain > 0 then rank() over (order by season_gain desc) end as season_rank
from players;

create unique index lb_id on private.lb (id);
create index lb_global on private.lb (global_rank);
create index lb_faction on private.lb (affinity, faction_rank);
create index lb_country on private.lb (country, country_rank);
create index lb_season on private.lb (season_rank);
revoke all on private.lb from public, anon, authenticated;

-- Counts per view and per tier, and when the snapshot was taken.
create table private.lb_meta (
  key text primary key,
  n bigint not null,
  at timestamptz not null default now()
);
alter table private.lb_meta enable row level security;

-- The Elo floors of the five tiers (web: profile.ts rankTier).
create function private.tier_floors() returns integer[]
language sql immutable set search_path = '' as $$ select array[0, 600, 1200, 2000, 3000] $$;

create function private.refresh_lb() returns void
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
    union all select 'tier:' || f[i], (select count(*) from private.lb where elo >= f[i] and (i = array_length(f, 1) or elo < f[i + 1]))
      from generate_subscripts(f, 1) i;
end;
$$;
select private.refresh_lb();

-- ---------------------------------------------------------------- rows and places
-- One row as the client draws it.
create function private.lb_row(r private.lb, place bigint, value integer, me uuid) returns json
language sql stable set search_path = '' as $$
  select json_build_object('place', place, 'id', r.id, 'name', r.display_name, 'title', r.title, 'elo', r.elo,
    'value', value, 'plate', r.plate, 'avatar', r.avatar, 'frame', r.frame, 'alive', r.alive,
    'affinity', r.affinity, 'country', r.country, 'me', r.id = me);
$$;

-- The scope a view uses: the asked one, or the player's own affinity / country.
create function private.lb_scope(p_view text, p_scope text, me uuid) returns text
language sql stable set search_path = '' as $$
  select case p_view
    when 'faction' then coalesce(p_scope, (select affinity from public.profiles where id = me))
    when 'country' then coalesce(upper(p_scope), (select country from public.profiles where id = me))
  end;
$$;

-- A view's rows from place p_from to p_to (inclusive), best first.
create function private.lb_range(p_view text, p_scope text, p_from bigint, p_to bigint, me uuid) returns json
language plpgsql stable set search_path = '' as $$
declare
  out json;
begin
  if p_view = 'global' then
    select json_agg(private.lb_row(r, r.global_rank, r.elo, me) order by r.global_rank, r.display_name) into out
      from private.lb r where r.global_rank between p_from and p_to;
  elsif p_view = 'season' then
    select json_agg(private.lb_row(r, r.season_rank, r.season_gain, me) order by r.season_rank, r.display_name) into out
      from private.lb r where r.season_rank between p_from and p_to;
  elsif p_view = 'faction' then
    select json_agg(private.lb_row(r, r.faction_rank, r.elo, me) order by r.faction_rank, r.display_name) into out
      from private.lb r where r.affinity = p_scope and r.faction_rank between p_from and p_to;
  elsif p_view = 'country' then
    select json_agg(private.lb_row(r, r.country_rank, r.elo, me) order by r.country_rank, r.display_name) into out
      from private.lb r where r.country = p_scope and r.country_rank between p_from and p_to;
  elsif p_view = 'friends' then
    -- who you follow, and you: small (at most 501), ranked on the spot
    select json_agg(private.lb_row(f.r, f.place, (f.r).elo, me) order by f.place, (f.r).display_name) into out
      from (select r, rank() over (order by r.elo desc) as place from private.lb r
            where r.id = me or r.id in (select followee from public.follows where follower = me)) f
      where f.place between p_from and p_to;
  else
    raise exception 'bad_request';
  end if;
  return coalesce(out, '[]'::json);
end;
$$;

-- Your place in a view: from the snapshot, or worked out live if you're not in it (new,
-- hidden, or ranked since the last refresh).
create function private.lb_place(p_view text, p_scope text, me uuid) returns bigint
language plpgsql stable set search_path = '' as $$
declare
  r private.lb;
  p public.profiles;
  gain integer;
begin
  select * into r from private.lb where id = me;
  select * into p from public.profiles where id = me;
  if p_view = 'global' then
    return coalesce(r.global_rank, case when p.ranked_games > 0 then 1 + (select count(*) from private.lb where elo > p.elo) end);
  elsif p_view = 'faction' then
    if p.affinity is distinct from p_scope then return null; end if;
    return coalesce(r.faction_rank, case when p.ranked_games > 0 then 1 + (select count(*) from private.lb where affinity = p_scope and elo > p.elo) end);
  elsif p_view = 'country' then
    if p.country is distinct from p_scope then return null; end if;
    return coalesce(r.country_rank, case when p.ranked_games > 0 then 1 + (select count(*) from private.lb where country = p_scope and elo > p.elo) end);
  elsif p_view = 'season' then
    if r.id is not null then return r.season_rank; end if;
    return null;
  elsif p_view = 'friends' then
    if p.ranked_games = 0 then return null; end if;
    return 1 + (select count(*) from private.lb l
                where l.id in (select followee from public.follows where follower = me) and l.elo > p.elo);
  end if;
  return null;
end;
$$;

create function private.lb_total(p_view text, p_scope text, me uuid) returns bigint
language sql stable set search_path = '' as $$
  select case p_view
    when 'global' then (select n from private.lb_meta where key = 'global')
    when 'season' then (select n from private.lb_meta where key = 'season')
    when 'faction' then (select n from private.lb_meta where key = 'faction:' || p_scope)
    when 'country' then (select n from private.lb_meta where key = 'country:' || p_scope)
    when 'friends' then (select count(*) from private.lb where id = me or id in (select followee from public.follows where follower = me))
  end;
$$;

-- ---------------------------------------------------------------- the calls
-- One page (50 rows) of a view.
create function public.lb_page(p_view text, p_page integer default 0, p_scope text default null) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  scope text := private.lb_scope(p_view, p_scope, auth.uid());
  pg integer := greatest(coalesce(p_page, 0), 0);
begin
  if me is null then raise exception 'not_signed_in'; end if;
  return json_build_object('view', p_view, 'scope', scope, 'page', pg,
    'rows', private.lb_range(p_view, scope, pg * 50 + 1, pg * 50 + 50, me),
    'total', coalesce(private.lb_total(p_view, scope, me), 0),
    'updated', (select max(at) from private.lb_meta));
end;
$$;

-- You, 10 above and 10 below.
create function public.lb_around_me(p_view text, p_scope text default null) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  scope text := private.lb_scope(p_view, p_scope, auth.uid());
  place bigint;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  place := private.lb_place(p_view, scope, me);
  return json_build_object('view', p_view, 'scope', scope, 'place', place,
    'rows', case when place is null then '[]'::json else private.lb_range(p_view, scope, greatest(place - 10, 1), place + 10, me) end,
    'listed', exists (select 1 from private.lb where id = me),
    'updated', (select max(at) from private.lb_meta));
end;
$$;

-- Your place and the view's size, for the pinned "You" bar.
create function public.lb_me(p_view text, p_scope text default null) returns json
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
    'value', case when p_view = 'season' then (select season_gain from private.lb where id = me) else p.elo end);
end;
$$;

-- Every tier with its Elo floor and how many ranked players sit in it.
create function public.lb_tiers() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'total', coalesce((select n from private.lb_meta where key = 'global'), 0),
    'tiers', (select json_agg(json_build_object('floor', f, 'players', coalesce((select n from private.lb_meta where key = 'tier:' || f), 0)) order by f)
              from unnest(private.tier_floors()) f));
$$;

-- Find players by name: prefix matches first, then similar names (typos). 30 a minute.
create function public.lb_search(p_query text) returns json
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
      select p.id, p.display_name as name, p.elo, p.title, p.plate, l.avatar, l.frame, r.global_rank as place,
             lower(p.display_name) like pat as prefix,
             extensions.similarity(lower(p.display_name), q) as score
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.avatar_loadouts l on l.player_id = p.id
      left join private.lb r on r.id = p.id
      where not coalesce(u.is_anonymous, false) and not p.lb_hidden
        and (lower(p.display_name) like pat or lower(p.display_name) operator(extensions.%) q)
      order by lower(p.display_name) like pat desc, extensions.similarity(lower(p.display_name), q) desc
      limit 20
    ) x
  ), '[]'::json);
end;
$$;

-- The show-off card, with the player's privacy choices applied.
create function public.player_card(p_player uuid) returns json
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
  if p.lb_hidden and p_player <> me then return json_build_object('hidden', true); end if;
  select * into l from public.avatar_loadouts where player_id = p_player;
  return json_build_object(
    'id', p.id, 'name', p.display_name, 'title', p.title, 'elo', p.elo, 'plate', p.plate,
    'avatar', l.avatar, 'frame', l.frame,
    'alive', coalesce((select polish = 1 from public.player_parts where player_id = p_player and part_id = coalesce(l.avatar, 's0-avatar-happy')), false),
    'peak', greatest(p.elo, coalesce((select max(elo_after) from public.games where user_id = p_player and elo_after is not null), 0)),
    'place', (select global_rank from private.lb where id = p_player),
    'notRanked', private.ranked_restricted(p_player),
    'affinity', p.affinity, 'country', p.country,
    'stats', case when p.card_stats or p_player = me then json_build_object(
      'solved', (select count(*) from public.games where user_id = p_player and won),
      'ranked', p.ranked_games) end,
    'badges', coalesce((select json_agg(badge order by earned_at desc) from public.player_badges where player_id = p_player), '[]'::json),
    'showcase', to_json(p.showcase),
    'following', exists (select 1 from public.follows where follower = me and followee = p_player),
    'me', p_player = me);
end;
$$;

create function public.follow(p_player uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if p_player = me then raise exception 'bad_request'; end if;
  if not exists (select 1 from public.profiles p join auth.users u on u.id = p.id
                 where p.id = p_player and not coalesce(u.is_anonymous, false) and not p.lb_hidden) then
    raise exception 'no_player';
  end if;
  if (select count(*) from public.follows where follower = me) >= 500 then raise exception 'too_many_follows'; end if;
  insert into public.follows (follower, followee) values (me, p_player) on conflict do nothing;
end;
$$;

create function public.unfollow(p_player uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.follows where follower = auth.uid() and followee = p_player;
$$;

create function public.set_card_privacy(p_hidden boolean, p_stats boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  update public.profiles set lb_hidden = coalesce(p_hidden, lb_hidden), card_stats = coalesce(p_stats, card_stats) where id = auth.uid();
end;
$$;

create function public.set_country(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_code is not null and upper(p_code) !~ '^[A-Z]{2}$' then raise exception 'bad_request'; end if;
  update public.profiles set country = upper(nullif(p_code, '')) where id = auth.uid();
end;
$$;

create function public.set_showcase(p_parts text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  part text;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if cardinality(coalesce(p_parts, '{}')) > 3 then raise exception 'bad_request'; end if;
  foreach part in array coalesce(p_parts, '{}') loop
    if not private.owns(me, part) then raise exception 'not_owned'; end if;
  end loop;
  update public.profiles set showcase = coalesce(p_parts, '{}') where id = me;
end;
$$;

-- ---------------------------------------------------------------- the affinities this month
-- A month's standings: average influence per active member (as affinity_standings).
create function private.standings(p_month date) returns table (affinity text, members integer, influence bigint, standing numeric)
language sql stable set search_path = '' as $$
  select e.affinity,
         coalesce(count(m.player_id) filter (where m.solves > 0), 0)::integer,
         coalesce(sum(m.influence), 0)::bigint,
         round(coalesce(sum(m.influence)::numeric / nullif(count(m.player_id) filter (where m.solves > 0), 0), 0), 2)
  from unnest(array['fire', 'water', 'earth', 'air']) as e (affinity)
  left join public.affinity_months m on m.affinity = e.affinity and m.month = p_month
  group by e.affinity;
$$;

create function public.faction_board() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_month date := date_trunc('month', now())::date;
  mine text;
  my_influence integer;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  select affinity into mine from public.profiles where id = me;
  select influence into my_influence from public.affinity_months where month = v_month and player_id = me and affinity = mine;
  return json_build_object(
    'month', v_month,
    'endsAt', (v_month + interval '1 month'),
    'standings', (select json_agg(row_to_json(s) order by s.standing desc, s.influence desc) from private.standings(v_month) s),
    'mine', mine,
    'myInfluence', coalesce(my_influence, 0),
    'myPlace', case when my_influence > 0 then 1 + (select count(*) from public.affinity_months a
                 where a.month = v_month and a.affinity = mine and a.influence > my_influence) end,
    'top', (select json_agg(json_build_object('id', t.player_id, 'name', t.display_name, 'influence', t.influence) order by t.influence desc)
            from (select a.player_id, p.display_name, a.influence
                  from public.affinity_months a
                  join public.profiles p on p.id = a.player_id
                  join auth.users u on u.id = a.player_id
                  where a.month = v_month and a.affinity = mine and a.influence > 0
                    and not p.lb_hidden and not coalesce(u.is_anonymous, false)
                  order by a.influence desc limit 10) t),
    'lastWinner', (select json_build_object('month', f.month, 'winner', f.winner) from public.faction_months f order by f.month desc limit 1));
end;
$$;

-- The month's result: the winner recorded once; everyone who added influence to it gets a
-- dated badge and 300 Stardust.
create function private.settle_faction_month(p_month date) returns text
language plpgsql security definer set search_path = '' as $$
declare
  win text;
begin
  if exists (select 1 from public.faction_months where month = p_month) then
    return (select winner from public.faction_months where month = p_month);
  end if;
  select s.affinity into win from private.standings(p_month) s where s.members > 0 order by s.standing desc, s.influence desc limit 1;
  insert into public.faction_months (month, winner) values (p_month, win);
  if win is null then return null; end if;
  with helped as (
    select player_id from public.affinity_months where month = p_month and affinity = win and influence > 0
  ), badged as (
    insert into public.player_badges (player_id, badge)
      select player_id, 'win-' || to_char(p_month, 'YYYY-MM') || '-' || win from helped
      on conflict do nothing
      returning player_id
  ), paid as (
    update public.profiles p set stardust = p.stardust + 300 from badged b where p.id = b.player_id returning p.id
  )
  insert into private.ledger (player_id, reason, ref, stardust)
    select id, 'faction_win', to_char(p_month, 'YYYY-MM') || '-' || win, 300 from paid;
  return win;
end;
$$;

-- ---------------------------------------------------------------- schedules (live only)
do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('lb-refresh', '*/5 * * * *', 'select private.refresh_lb()');
    perform cron.schedule('faction-settle', '5 0 1 * *',
      $$select private.settle_faction_month((date_trunc('month', now()) - interval '1 month')::date)$$);
  end if;
end
$do$;

-- ---------------------------------------------------------------- grants
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.lb_page(text, integer, text), public.lb_around_me(text, text), public.lb_me(text, text),
  public.lb_tiers(), public.lb_search(text), public.player_card(uuid), public.follow(uuid), public.unfollow(uuid),
  public.set_card_privacy(boolean, boolean), public.set_country(text), public.set_showcase(text[]), public.faction_board()
  from public, anon;
grant execute on function public.lb_page(text, integer, text), public.lb_around_me(text, text), public.lb_me(text, text),
  public.lb_tiers(), public.lb_search(text), public.player_card(uuid), public.follow(uuid), public.unfollow(uuid),
  public.set_card_privacy(boolean, boolean), public.set_country(text), public.set_showcase(text[]), public.faction_board()
  to authenticated;
