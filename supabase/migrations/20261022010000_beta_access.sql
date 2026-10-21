-- Beta access is checked on every session, not only at sign-up (security review of beta_testers).
--
-- hook_before_user_created only runs when an account is made, so an account that already
-- exists (a guest from before, or one whose email was changed later) got past it, and a
-- removed tester kept their session. hook_beta_access_token is the beta project's Custom
-- Access Token hook (Authentication > Auth Hooks): each time a session is issued or refreshed,
-- the account's current email must be a tester's or a founder's, or there's no session. A
-- removed tester is out at their next refresh (an hour at most).
--
-- Both hooks do nothing where the dev tools are off (live), so turning one on there by mistake
-- can't lock players out.

-- As in beta_testers; passes everyone where it isn't beta.
create or replace function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e text := lower(nullif(trim(event -> 'user' ->> 'email'), ''));
begin
  if not private.dev_tools() then return '{}'::jsonb; end if;
  if e is not null and (exists (select 1 from private.beta_testers t where t.email = e)
                        or exists (select 1 from private.founders f where lower(f.email) = e)) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'not_a_tester'));
end;
$$;

-- The session's account, by its current email: a tester or a founder keeps the claims as they are.
create function public.hook_beta_access_token(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e text;
begin
  if not private.dev_tools() then return jsonb_build_object('claims', event -> 'claims'); end if;
  select lower(nullif(trim(u.email), '')) into e from auth.users u where u.id = (event ->> 'user_id')::uuid;
  if e is not null and (exists (select 1 from private.beta_testers t where t.email = e)
                        or exists (select 1 from private.founders f where lower(f.email) = e)) then
    return jsonb_build_object('claims', event -> 'claims');
  end if;
  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'not_a_tester'));
end;
$$;
revoke execute on function public.hook_beta_access_token(jsonb) from public, anon, authenticated;
grant execute on function public.hook_beta_access_token(jsonb) to supabase_auth_admin;
