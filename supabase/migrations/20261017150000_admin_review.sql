-- The in-app Review dashboard (web: screens/review.ts), for founders only.
--
--   admin_review()                              every flagged player, with their flagged games
--   admin_moderate(user, action, days?, note?)  'clear' | 'restrict' | 'lift'
--
-- Both check that the caller's confirmed email is in private.founders, so
-- nobody else can read the list or act, whatever the app sends.

create function private.is_admin(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    join private.founders f on lower(f.email) = lower(u.email)
    where u.id = p_user and u.email_confirmed_at is not null
  );
$$;
revoke execute on function private.is_admin(uuid) from public, anon, authenticated;

create function public.admin_review() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  result json;
begin
  if not private.is_admin(auth.uid()) then raise exception 'not_admin'; end if;
  select coalesce(json_agg(player order by (player ->> 'toReview')::int = 0, (player ->> 'copied')::int desc, player ->> 'lastFlag' desc), '[]'::json)
  into result
  from (
    select json_build_object(
      'userId', p.id,
      'name', p.display_name,
      'email', nullif(u.email, ''),
      'elo', p.elo,
      'restricted', r.user_id is not null and (r.until is null or r.until > now()),
      'restrictedUntil', case when r.until > now() then r.until end,
      'restrictionReason', case when r.user_id is not null and (r.until is null or r.until > now()) then r.reason end,
      'toReview', count(*) filter (where not f.reviewed),
      'copied', count(*) filter (where f.reason = 'copied'),
      'unchecked', count(*) filter (where f.reason = 'unchecked'),
      'lastFlag', max(f.created_at),
      'games', json_agg(json_build_object(
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
      ) order by f.created_at desc)
    ) as player
    from private.review_flags f
    join public.profiles p on p.id = f.user_id
    left join auth.users u on u.id = f.user_id
    left join public.games g on g.id = f.game_id
    left join private.ranked_restrictions r on r.user_id = f.user_id
    group by p.id, p.display_name, u.email, p.elo, r.user_id, r.until, r.reason
  ) players;
  return result;
end;
$$;

create function public.admin_moderate(p_user uuid, p_action text, p_days integer default null, p_note text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_until timestamptz;
begin
  if not private.is_admin(me) then raise exception 'not_admin'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'no_player'; end if;

  if p_action = 'clear' then
    update private.review_flags
      set reviewed = true, note = coalesce(v_note, 'It was a mistake')
      where user_id = p_user and not reviewed;
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

  elsif p_action = 'lift' then
    delete from private.ranked_restrictions where user_id = p_user;

  else
    raise exception 'bad_action';
  end if;

  return json_build_object('ok', true, 'until', v_until);
end;
$$;

revoke execute on function public.admin_review(), public.admin_moderate(uuid, text, integer, text) from public, anon;
grant execute on function public.admin_review(), public.admin_moderate(uuid, text, integer, text) to authenticated;
