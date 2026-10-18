-- Review dashboard, made to cope with many flags (web: screens/review.ts).
--
-- * Every decision goes into private.moderation_log, so a handled case leaves
--   the queue and shows up under History instead.
-- * admin_review_page(view, limit, offset) returns one page of a view:
--     'open'    players with flags still to review, worst first
--     'banned'  players banned from Ranked right now
--     'history' decisions, newest first
--   plus the count for each view.
-- * One private.moderate() does the work for the app and the SQL Editor
--   helpers alike, so both are logged the same way.
-- admin_review() (the first version) stays for the app until this one ships.

create table private.moderation_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in ('clear', 'restrict', 'lift')),
  -- 'restrict' only: the ban length, null = until lifted.
  days integer,
  note text,
  -- How many flags this decision settled.
  flags integer not null default 0,
  -- The founder who decided; null from the SQL Editor.
  by_user uuid,
  created_at timestamptz not null default now()
);
create index on private.moderation_log (created_at desc);
create index on private.moderation_log (user_id, created_at desc);
alter table private.moderation_log enable row level security;
create index if not exists review_flags_open_idx on private.review_flags (user_id) where not reviewed;

-- Flags reviewed before the log existed count as one past decision per player.
insert into private.moderation_log (user_id, action, note, flags, created_at)
select user_id, 'clear', max(note), count(*), max(created_at)
from private.review_flags where reviewed group by user_id;

create function private.moderate(p_user uuid, p_action text, p_days integer, p_note text, p_by uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_until timestamptz;
  v_flags integer := 0;
begin
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'no_player'; end if;

  if p_action = 'clear' then
    update private.review_flags set reviewed = true, note = coalesce(v_note, 'It was a mistake')
      where user_id = p_user and not reviewed;
    get diagnostics v_flags = row_count;
    delete from private.ranked_restrictions where user_id = p_user;

  elsif p_action = 'restrict' then
    if p_days is not null and p_days not between 1 and 3650 then raise exception 'bad_days'; end if;
    v_until := case when p_days is null then null else now() + make_interval(days => p_days) end;
    insert into private.ranked_restrictions (user_id, until, reason)
      values (p_user, v_until, coalesce(v_note, 'Copied answers in Ranked'))
      on conflict (user_id) do update set until = excluded.until, reason = excluded.reason, created_at = now();
    update private.review_flags
      set reviewed = true,
          note = 'Banned from Ranked ' || case when v_until is null then 'until lifted' else 'for ' || p_days || ' days' end
                 || coalesce(': ' || v_note, '')
      where user_id = p_user and not reviewed;
    get diagnostics v_flags = row_count;

  elsif p_action = 'lift' then
    delete from private.ranked_restrictions where user_id = p_user;

  else
    raise exception 'bad_action';
  end if;

  insert into private.moderation_log (user_id, action, days, note, flags, by_user)
    values (p_user, p_action, case when p_action = 'restrict' then p_days end, v_note, v_flags, p_by);
  return v_until;
end;
$$;

create or replace function public.admin_moderate(p_user uuid, p_action text, p_days integer default null, p_note text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_until timestamptz;
begin
  if not private.is_admin(auth.uid()) then raise exception 'not_admin'; end if;
  v_until := private.moderate(p_user, p_action, p_days, p_note, auth.uid());
  return json_build_object('ok', true, 'until', v_until);
end;
$$;

-- The SQL Editor helpers go through the same path (and so into the log).
create or replace function private.restrict_ranked(p_player text, p_days integer default null, p_reason text default 'Copied answers in Ranked')
returns text language plpgsql set search_path = '' as $$
declare
  v_until timestamptz := private.moderate(private.find_player(p_player), 'restrict', p_days, p_reason, null);
begin
  return format('%s can''t play Ranked %s.', p_player,
    case when v_until is null then 'until you lift it' else 'until ' || to_char(v_until at time zone 'utc', 'YYYY-MM-DD') end);
end;
$$;

create or replace function private.lift_ranked(p_player text) returns text
language plpgsql set search_path = '' as $$
begin
  perform private.moderate(private.find_player(p_player), 'lift', null, null, null);
  return format('%s can play Ranked again.', p_player);
end;
$$;

create or replace function private.clear_flags(p_player text, p_note text default 'It was a mistake') returns text
language plpgsql set search_path = '' as $$
begin
  perform private.moderate(private.find_player(p_player), 'clear', null, p_note, null);
  return format('%s: flags cleared.', p_player);
end;
$$;

-- One player as the dashboard shows them. p_open_only: just the flags still to review.
create function private.review_player(p_user uuid, p_open_only boolean) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'userId', p.id,
    'name', p.display_name,
    'email', nullif(u.email, ''),
    'elo', p.elo,
    'restricted', r.user_id is not null,
    'restrictedUntil', r.until,
    'restrictionReason', r.reason,
    'toReview', (select count(*) from private.review_flags f where f.user_id = p.id and not f.reviewed),
    'flagged', (select count(*) from private.review_flags f where f.user_id = p.id),
    'decisions', (select count(*) from private.moderation_log l where l.user_id = p.id),
    'lastDecision', (
      select json_build_object('action', l.action, 'days', l.days, 'note', l.note, 'at', l.created_at)
      from private.moderation_log l where l.user_id = p.id order by l.created_at desc limit 1
    ),
    'games', coalesce((
      select json_agg(x.game order by x.at desc) from (
        select f.created_at as at, json_build_object(
          'flagId', f.id,
          'at', f.created_at,
          'reason', f.reason,
          'leaps', (f.audit ->> 'leaps')::int,
          'placements', (f.audit ->> 'placements')::int,
          'evidence', (f.audit ->> 'evidence')::numeric,
          'potential', (f.audit ->> 'potential')::numeric,
          'validPuzzle', f.audit ->> 'solution' is not null,
          'rating', g.rating,
          'seconds', g.seconds,
          'reviewed', f.reviewed,
          'note', f.note
        ) as game
        from private.review_flags f left join public.games g on g.id = f.game_id
        where f.user_id = p.id and (not p_open_only or not f.reviewed)
        order by f.created_at desc limit 20
      ) x
    ), '[]'::json)
  )
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join private.ranked_restrictions r on r.user_id = p.id and (r.until is null or r.until > now())
  where p.id = p_user;
$$;

create function public.admin_review_page(p_view text default 'open', p_limit integer default 25, p_offset integer default 0)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_open integer;
  v_banned integer;
  v_history integer;
  v_items json;
begin
  if not private.is_admin(auth.uid()) then raise exception 'not_admin'; end if;
  select count(distinct user_id) into v_open from private.review_flags where not reviewed;
  select count(*) into v_banned from private.ranked_restrictions where until is null or until > now();
  select count(*) into v_history from private.moderation_log;

  if p_view = 'open' then
    -- Worst first: the most flags for copying, then the most flags, then the latest.
    select coalesce(json_agg(private.review_player(o.user_id, true) order by o.n), '[]'::json) into v_items
    from (
      select f.user_id, row_number() over (
        order by count(*) filter (where f.reason = 'copied') desc, count(*) desc, max(f.created_at) desc) as n
      from private.review_flags f where not f.reviewed group by f.user_id
      order by n limit v_limit offset v_offset
    ) o;

  elsif p_view = 'banned' then
    select coalesce(json_agg(private.review_player(b.user_id, false) order by b.created_at desc), '[]'::json) into v_items
    from (
      select r.user_id, r.created_at from private.ranked_restrictions r
      where r.until is null or r.until > now()
      order by r.created_at desc limit v_limit offset v_offset
    ) b;

  elsif p_view = 'history' then
    select coalesce(json_agg(json_build_object(
      'id', l.id,
      'at', l.created_at,
      'userId', l.user_id,
      'name', p.display_name,
      'action', l.action,
      'days', l.days,
      'note', l.note,
      'flags', l.flags,
      'by', b.display_name
    ) order by l.created_at desc, l.id desc), '[]'::json) into v_items
    from (
      select * from private.moderation_log order by created_at desc, id desc limit v_limit offset v_offset
    ) l
    join public.profiles p on p.id = l.user_id
    left join public.profiles b on b.id = l.by_user;

  else
    raise exception 'bad_view';
  end if;

  return json_build_object(
    'counts', json_build_object('open', v_open, 'banned', v_banned, 'history', v_history),
    'items', v_items
  );
end;
$$;

revoke execute on function private.moderate(uuid, text, integer, text, uuid), private.review_player(uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.admin_review_page(text, integer, integer) from public, anon;
grant execute on function public.admin_review_page(text, integer, integer) to authenticated;
