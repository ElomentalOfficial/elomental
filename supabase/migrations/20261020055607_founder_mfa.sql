-- Founder powers need two steps (asked for by the owner 2026-10-20). Until now a founder was
-- anyone signed in with a confirmed founder email; whoever got into that inbox, or stole a
-- signed-in session, had Review and Dev mode.
--
-- * private.is_admin now also needs this session to have passed an authenticator-app code
--   (Supabase Auth MFA, TOTP: the token's aal claim is 'aal2'). Every founder function goes
--   through it: Review (admin_review, admin_review_page, admin_search, admin_moderate) and Dev
--   mode (dev_set_mode, dev_action, and dev mode's exceptions in finish_game and drops).
--   Without the code they answer not_admin, and games follow the normal rules.
-- * private.founder_log keeps every Dev mode switch and tool use: who, what, when. Review
--   decisions were already in private.moderation_log.
-- * founder_activity(limit): the newest founder actions from both logs, for founders (with
--   their code) to spot anything they didn't do.
--
-- A lost phone: remove the factor in the Supabase dashboard (Authentication > Users > the
-- founder > MFA factors), then set it up again in Setup.

create or replace function private.is_admin(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from auth.users u
       join private.founders f on lower(f.email) = lower(u.email)
       where u.id = p_user and u.email_confirmed_at is not null
     );
$$;
revoke execute on function private.is_admin(uuid) from public, anon, authenticated;

-- Is this session's account a founder at all (code or not)? So Setup can ask for the code.
create function public.founder_status() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'founder', exists (
      select 1 from auth.users u join private.founders f on lower(f.email) = lower(u.email)
      where u.id = auth.uid() and u.email_confirmed_at is not null),
    'unlocked', private.is_admin(auth.uid()));
$$;

-- ---------------------------------------------------------------- the log
create table private.founder_log (
  id bigint generated always as identity primary key,
  founder_id uuid not null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index on private.founder_log (created_at desc);
alter table private.founder_log enable row level security;
revoke all on private.founder_log from public, anon, authenticated;

create or replace function public.dev_set_mode(p_on boolean) returns json
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
  insert into private.founder_log (founder_id, action) values (uid, case when coalesce(p_on, false) then 'dev_on' else 'dev_off' end);
  return json_build_object('devMode', coalesce(p_on, false));
end;
$$;

create or replace function public.dev_action(p_action text, p_value text default null) returns json
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
  insert into private.founder_log (founder_id, action, detail) values (uid, p_action, p_value);
  return json_build_object('action', p_action);
end;
$$;

-- The newest founder actions: Dev mode and Review decisions, with the founder's name.
create function public.founder_activity(p_limit integer default 30) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin(auth.uid()) then raise exception 'not_admin'; end if;
  return coalesce((
    select json_agg(row_to_json(a) order by a.at desc)
    from (
      select l.created_at as at, p.display_name as founder, l.action, l.detail
        from private.founder_log l left join public.profiles p on p.id = l.founder_id
      union all
      select m.created_at, p.display_name, 'review_' || m.action, coalesce(t.display_name, m.user_id::text)
        from private.moderation_log m
        left join public.profiles p on p.id = m.by_user
        left join public.profiles t on t.id = m.user_id
      order by 1 desc
      limit least(greatest(coalesce(p_limit, 30), 1), 200)
    ) a
  ), '[]'::json);
end;
$$;

-- ---------------------------------------------------------------- grants
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.founder_status(), public.founder_activity(integer) from public, anon;
grant execute on function public.founder_status(), public.founder_activity(integer) to authenticated;
