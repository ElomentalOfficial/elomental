-- Restricting a player from Ranked, without touching their account.
--
-- Run these in the SQL Editor, with the player's name as it shows in
-- private.review_by_player:
--
--   select private.restrict_ranked('Quiet Logician');          -- until you lift it
--   select private.restrict_ranked('Quiet Logician', 30);      -- for 30 days
--   select private.restrict_ranked('Quiet Logician', 30, 'Copied answers twice');
--   select private.lift_ranked('Quiet Logician');              -- Ranked again
--   select private.clear_flags('Quiet Logician');              -- it was a mistake
--   select private.clear_flags('Quiet Logician', 'Spoke to them, fine');
--
-- A restricted player keeps everything (Elo, Stardust, Daily, Clash results)
-- and can still play Casual, Daily and Clash; start_game refuses Ranked with
-- 'ranked_restricted', and they're left off the leaderboard while it lasts.

create table private.ranked_restrictions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- null: until lifted by hand.
  until timestamptz,
  reason text not null,
  created_at timestamptz not null default now()
);

create function private.ranked_restricted(p_user uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from private.ranked_restrictions r
    where r.user_id = p_user and (r.until is null or r.until > now())
  );
$$;

/** The player with this name (any capitalisation), or an error naming the problem. */
create function private.find_player(p_player text) returns uuid
language plpgsql stable set search_path = '' as $$
declare
  v_id uuid;
begin
  select id into v_id from public.profiles where lower(display_name) = lower(trim(p_player));
  if v_id is null then raise exception 'No player called "%"', p_player; end if;
  return v_id;
end;
$$;

create function private.restrict_ranked(p_player text, p_days integer default null, p_reason text default 'Copied answers in Ranked')
returns text language plpgsql set search_path = '' as $$
declare
  v_id uuid := private.find_player(p_player);
  v_until timestamptz := case when p_days is null then null else now() + make_interval(days => p_days) end;
begin
  insert into private.ranked_restrictions (user_id, until, reason) values (v_id, v_until, p_reason)
    on conflict (user_id) do update set until = excluded.until, reason = excluded.reason, created_at = now();
  update private.review_flags
    set reviewed = true, note = coalesce(note || ' · ', '') || 'Ranked restricted: ' || p_reason
    where user_id = v_id and not reviewed;
  return format('%s can''t play Ranked %s.', p_player,
    case when v_until is null then 'until you lift it' else 'until ' || to_char(v_until at time zone 'utc', 'YYYY-MM-DD') end);
end;
$$;

create function private.lift_ranked(p_player text) returns text
language plpgsql set search_path = '' as $$
declare
  v_id uuid := private.find_player(p_player);
begin
  delete from private.ranked_restrictions where user_id = v_id;
  return format('%s can play Ranked again.', p_player);
end;
$$;

create function private.clear_flags(p_player text, p_note text default 'Checked: a false alarm') returns text
language plpgsql set search_path = '' as $$
declare
  v_id uuid := private.find_player(p_player);
  v_count integer;
begin
  update private.review_flags set reviewed = true, note = p_note where user_id = v_id and not reviewed;
  get diagnostics v_count = row_count;
  return format('%s: %s flag(s) marked as reviewed.', p_player, v_count);
end;
$$;

revoke execute on function private.ranked_restricted(uuid), private.find_player(text),
  private.restrict_ranked(text, integer, text), private.lift_ranked(text), private.clear_flags(text, text)
  from public, anon, authenticated;

-- start_game: a restricted player can't start Ranked (other modes unchanged).
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
    if p_date_key is null or p_date_key not between today - 1 and today + 1 then raise exception 'bad_date'; end if;
    if exists (select 1 from public.games where user_id = uid and mode = 'daily' and date_key = p_date_key and won) then
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

-- Leaderboard: restricted players are left off while it lasts.
create or replace function public.leaderboard(p_limit integer default 50)
returns table(rank bigint, display_name text, elo integer, ranked_games integer, is_me boolean)
language sql stable security definer set search_path = '' as $$
  select rank() over (order by p.elo desc), p.display_name, p.elo, p.ranked_games, p.id = auth.uid()
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.ranked_games > 0 and not coalesce(u.is_anonymous, false) and not private.ranked_restricted(p.id)
  order by p.elo desc limit least(greatest(p_limit, 1), 100);
$$;

-- The review view shows whether each player may play Ranked.
drop view private.review_by_player;
create view private.review_by_player with (security_invoker = true) as
select
  p.display_name as player,
  coalesce(nullif(u.email, ''), 'guest') as email,
  case
    when r.user_id is null or (r.until is not null and r.until <= now()) then 'Allowed'
    when r.until is null then 'Restricted until lifted'
    else 'Restricted until ' || to_char(r.until at time zone 'utc', 'YYYY-MM-DD')
  end as ranked,
  count(*) filter (where not f.reviewed) as to_review,
  count(*) filter (where f.reason = 'copied') as copied,
  count(*) filter (where f.reason = 'unchecked') as not_checked,
  to_char(max(f.created_at) at time zone 'utc', 'YYYY-MM-DD HH24:MI') || ' UTC' as last_flag,
  case
    when count(*) filter (where f.reason = 'copied') >= 3 then 'Repeatedly copies answers: worth a closer look.'
    when count(*) filter (where f.reason = 'copied') >= 1 then 'Copied at least once.'
    else 'Only unchecked solves (connection), probably fine.'
  end as summary,
  p.elo,
  f.user_id
from private.review_flags f
join public.profiles p on p.id = f.user_id
left join auth.users u on u.id = f.user_id
left join private.ranked_restrictions r on r.user_id = f.user_id
group by f.user_id, p.display_name, u.email, p.elo, r.user_id, r.until
order by count(*) filter (where not f.reviewed) = 0, count(*) filter (where f.reason = 'copied') desc, max(f.created_at) desc;
