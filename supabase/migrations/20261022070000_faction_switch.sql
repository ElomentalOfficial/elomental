-- Faction switching, monthly (docs/PROGRESSION_DESIGN.md, "Collection for the long run";
-- owner 2026-10-22): once a month, within your first 5 days in your faction that month.
--
-- Your 5 days run from the later of the day you joined and the 1st of the month (UTC), so the
-- choice opens again for every month's war. One switch a month; the new faction then holds until
-- the next month. Replaces the old rule (once a season, in its first 7 days).

alter table public.profiles
  add column affinity_since timestamptz,
  add column affinity_switched_month date;

-- players already in a faction get their 5 days from now
update public.profiles set affinity_since = now() where affinity is not null;

create or replace function private.affinity_switch_until(p public.profiles, p_at timestamptz default now()) returns timestamptz
language sql stable set search_path = '' as $$
  select case
    when p.affinity is null then null
    when p.affinity_switched_month = date_trunc('month', p_at at time zone 'utc')::date then null
    else greatest(coalesce(p.affinity_since, p_at), date_trunc('month', p_at at time zone 'utc') at time zone 'utc') + interval '5 days'
  end;
$$;

create or replace function public.choose_affinity(p_affinity text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  p public.profiles;
  until timestamptz;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_affinity not in ('fire', 'water', 'earth', 'air') then raise exception 'bad_request'; end if;
  select * into p from public.profiles where id = uid for update;
  if (select count(*) from public.games where user_id = uid and won) < 3 then raise exception 'too_soon'; end if;
  if p.affinity = p_affinity then return json_build_object('affinity', p_affinity); end if;
  if p.affinity is null then
    update public.profiles set affinity = p_affinity, affinity_since = now() where id = uid;
    return json_build_object('affinity', p_affinity);
  end if;
  until := private.affinity_switch_until(p);
  if until is null or now() >= until then raise exception 'affinity_locked'; end if;
  update public.profiles
    set affinity = p_affinity, affinity_since = now(),
        affinity_switched_month = date_trunc('month', now() at time zone 'utc')::date
    where id = uid;
  return json_build_object('affinity', p_affinity);
end;
$$;

-- Until when you may switch (null: not now). The app asks; choose_affinity decides.
create or replace function public.affinity_switch_open() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select private.affinity_switch_until(p) from public.profiles p where p.id = auth.uid()
    and private.affinity_switch_until(p) > now();
$$;

revoke all on function private.affinity_switch_until(public.profiles, timestamptz) from public, anon, authenticated;
revoke all on function public.affinity_switch_open() from public, anon;
grant execute on function public.affinity_switch_open() to authenticated;
