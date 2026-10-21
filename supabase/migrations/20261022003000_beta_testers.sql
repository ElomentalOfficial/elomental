-- Dev mode is for beta, and beta is for invited testers (the owner, 2026-10-22).
--
-- * One switch says this database is beta: private.app_flags 'dev_tools'. It's off here and
--   turned on in the beta project only (a data change, so both projects keep the same schema).
--   While it's off (live): dev mode can't be turned on, dev mode that was on does nothing, and
--   Show founders can't be changed. Live's founder tools are Review only.
-- * Testers: private.beta_testers, the emails allowed an account on beta. The beta project runs
--   hook_before_user_created as its "Before User Created" auth hook (Authentication > Auth Hooks),
--   so only those emails and the founders' get an account; any other sign-up is refused with
--   not_a_tester. Founders manage the list from their tools (beta_testers, beta_tester_add,
--   beta_tester_remove): removing one also deletes their beta account.

insert into private.app_flags (name, enabled) values ('dev_tools', false) on conflict do nothing;

-- This database is beta: dev tools and testers.
create function private.dev_tools() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from private.app_flags where name = 'dev_tools'), false);
$$;

-- As in dev_mode, and only where the dev tools are (beta).
create or replace function private.dev_on(p_player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.dev_tools() and private.is_admin(p_player)
     and coalesce((select dev_mode from public.profiles where id = p_player), false);
$$;

-- Where the tools are off, dev mode goes off (the accounts stay test accounts).
update public.profiles set dev_mode = false, dev_next_drop = null, dev_next_spirit = false
  where dev_mode and not private.dev_tools();

-- As in review_integrity; turning it on needs beta.
create or replace function public.dev_set_mode(p_on boolean) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not private.is_admin(uid) then raise exception 'not_admin'; end if;
  if coalesce(p_on, false) and not private.dev_tools() then raise exception 'beta_only'; end if;
  update public.profiles
    set dev_mode = coalesce(p_on, false),
        -- once on, the account is a test account for good
        test_account = test_account or coalesce(p_on, false),
        dev_next_drop = case when coalesce(p_on, false) then dev_next_drop end,
        dev_next_spirit = coalesce(p_on, false) and dev_next_spirit
    where id = uid;
  insert into private.founder_log (founder_id, action) values (uid, case when coalesce(p_on, false) then 'dev_on' else 'dev_off' end);
  return json_build_object('devMode', coalesce(p_on, false));
end;
$$;

-- As in show_founders; beta only.
create or replace function public.dev_show_founders(p_on boolean) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not private.is_admin(uid) then raise exception 'not_admin'; end if;
  if not private.dev_tools() then raise exception 'beta_only'; end if;
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

-- ---------------------------------------------------------------- testers
create table private.beta_testers (
  email text primary key check (email = lower(email) and email ~ '^\S+@\S+\.\S+$'),
  added_by uuid,
  added_at timestamptz not null default now()
);
alter table private.beta_testers enable row level security;
revoke all on private.beta_testers from public, anon, authenticated;

-- The auth hook (beta only, set in the dashboard): an account only for a tester or a founder.
-- Guests (no email) are refused too.
create function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e text := lower(nullif(trim(event -> 'user' ->> 'email'), ''));
begin
  if e is not null and (exists (select 1 from private.beta_testers t where t.email = e)
                        or exists (select 1 from private.founders f where lower(f.email) = e)) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'not_a_tester'));
end;
$$;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- The list, for founders on beta: each email, when it was added, and whether it has signed in.
create function public.beta_testers() returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin(auth.uid()) then raise exception 'not_admin'; end if;
  if not private.dev_tools() then raise exception 'beta_only'; end if;
  return coalesce((
    select json_agg(json_build_object(
             'email', t.email,
             'addedAt', t.added_at,
             'name', p.display_name,
             'lastSeen', u.last_sign_in_at) order by t.added_at desc)
      from private.beta_testers t
      left join auth.users u on lower(u.email) = t.email
      left join public.profiles p on p.id = u.id), '[]'::json);
end;
$$;

create function public.beta_tester_add(p_email text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  e text := lower(trim(coalesce(p_email, '')));
begin
  if not private.is_admin(uid) then raise exception 'not_admin'; end if;
  if not private.dev_tools() then raise exception 'beta_only'; end if;
  if e !~ '^\S+@\S+\.\S+$' or length(e) > 254 then raise exception 'bad_email'; end if;
  insert into private.beta_testers (email, added_by) values (e, uid) on conflict do nothing;
  if found then insert into private.founder_log (founder_id, action, detail) values (uid, 'tester_add', e); end if;
  return json_build_object('email', e);
end;
$$;

-- Off the list, and their beta account goes (a founder's never does).
create function public.beta_tester_remove(p_email text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  e text := lower(trim(coalesce(p_email, '')));
begin
  if not private.is_admin(uid) then raise exception 'not_admin'; end if;
  if not private.dev_tools() then raise exception 'beta_only'; end if;
  delete from private.beta_testers where email = e;
  if not found then return json_build_object('email', e); end if;
  delete from auth.users u where lower(u.email) = e
    and not exists (select 1 from private.founders f where lower(f.email) = e);
  insert into private.founder_log (founder_id, action, detail) values (uid, 'tester_remove', e);
  return json_build_object('email', e);
end;
$$;

revoke execute on function public.beta_testers(), public.beta_tester_add(text), public.beta_tester_remove(text) from public, anon;
grant execute on function public.beta_testers(), public.beta_tester_add(text), public.beta_tester_remove(text) to authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
