-- Daily reminders (owner, 2026-10-24: "both"): an opt-in nudge at the player's chosen hour, in
-- their own time zone, when today's Daily isn't solved yet: a web push to each device they turned
-- it on for, and/or an email (accounts with an email only). At most one a day.
--
-- * private.reminders: one row per player who set a reminder (hour, time zone, push, email), the
--   day it was last sent, and the token an email's "turn these off" link carries.
-- * private.push_subscriptions: each device's Web Push subscription (endpoint and keys).
-- * Players read and write them only through the functions below (reminder_get, reminder_set,
--   push_subscribe, push_unsubscribe).
-- * Sending: every hour pg_cron calls private.call_reminders(), which posts to the send-reminders
--   Edge Function with a shared secret (vault: reminder_cron_secret, and the project's own URL in
--   vault: project_url); with either secret missing it does nothing. The function takes the due
--   list from public.reminders_take() (service role only), which marks each one sent for the day.

create table private.reminders (
  player_id uuid primary key references auth.users (id) on delete cascade,
  hour smallint not null check (hour between 0 and 23),
  tz text not null,
  push boolean not null default false,
  email boolean not null default false,
  last_sent date,
  off_token uuid not null default gen_random_uuid() unique,
  updated_at timestamptz not null default now()
);

create table private.push_subscriptions (
  endpoint text primary key,
  player_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_player on private.push_subscriptions (player_id);

-- An account can get reminder emails: a confirmed address, not a guest (so nobody can point daily
-- email at an address that isn't theirs).
create function private.can_email(u auth.users) returns boolean
language sql immutable set search_path = '' as $$
  select u.email is not null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false);
$$;

-- The push services a browser subscribes with (Chrome, Edge, Samsung, Opera and Brave on FCM;
-- Firefox; Safari; Windows): the sender only ever posts to these.
create function private.push_host_ok(p_endpoint text) returns boolean
language sql immutable set search_path = '' as $$
  select p_endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/';
$$;

-- The player's reminder (hour null and both off when none is set), whether the account can get
-- email, and on how many devices push is on.
create function public.reminder_get() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object('hour', r.hour, 'tz', r.tz, 'push', coalesce(r.push, false), 'email', coalesce(r.email, false),
    'emailOk', private.can_email(u),
    'devices', (select count(*)::int from private.push_subscriptions s where s.player_id = u.id))
  from auth.users u left join private.reminders r on r.player_id = u.id where u.id = auth.uid();
$$;

-- Sets (or, with both off, clears) the player's reminder. The time zone is an IANA name from the
-- browser; an unknown one is refused, so the hour always means the player's own time.
create function public.reminder_set(p_hour integer, p_tz text, p_push boolean, p_email boolean) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  can_email boolean;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_hour is null or p_hour not between 0 and 23 then raise exception 'bad_request'; end if;
  if p_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then raise exception 'bad_request'; end if;
  select private.can_email(u) into can_email from auth.users u where u.id = uid;
  if coalesce(p_email, false) and not coalesce(can_email, false) then raise exception 'no_email'; end if;
  if not coalesce(p_push, false) and not coalesce(p_email, false) then
    delete from private.reminders where player_id = uid;
    delete from private.push_subscriptions where player_id = uid;
    return null;
  end if;
  insert into private.reminders (player_id, hour, tz, push, email)
    values (uid, p_hour, p_tz, coalesce(p_push, false), coalesce(p_email, false))
    on conflict (player_id) do update
      set hour = excluded.hour, tz = excluded.tz, push = excluded.push, email = excluded.email, updated_at = now();
  -- push off: this player's devices are forgotten
  if not coalesce(p_push, false) then delete from private.push_subscriptions where player_id = uid; end if;
  return public.reminder_get();
end;
$$;

-- A device's push subscription (the browser's PushSubscription), kept for this player; a device
-- already on file moves to them. Only a known push service's address, with keys of the right
-- shape (a P-256 key and a 16-byte secret, base64url). At most 10 devices a player.
create function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_endpoint is null or length(p_endpoint) > 1000 or not private.push_host_ok(p_endpoint)
     or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{80,100}$'
     or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{16,32}$' then
    raise exception 'bad_request';
  end if;
  insert into private.push_subscriptions (endpoint, player_id, p256dh, auth)
    values (p_endpoint, uid, p_p256dh, p_auth)
    on conflict (endpoint) do update set player_id = uid, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
  delete from private.push_subscriptions where player_id = uid and endpoint not in (
    select endpoint from private.push_subscriptions where player_id = uid order by created_at desc limit 10);
end;
$$;

create function public.push_unsubscribe(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from private.push_subscriptions where endpoint = p_endpoint and player_id = auth.uid();
$$;

-- Days in a row with the Daily solved or filled in, ending yesterday in the player's own day
-- (the Daily turns at 3 AM local, as on the client: days.ts).
create function private.daily_streak_before(p_player uuid, p_today date) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  d date := p_today - 1;
  run integer := 0;
begin
  while run < 1000 and (
    exists (select 1 from public.games where user_id = p_player and mode = 'daily' and won and date_key = d)
    or exists (select 1 from public.daily_mends where player_id = p_player and date_key = d)) loop
    run := run + 1;
    d := d - 1;
  end loop;
  return run;
end;
$$;

-- The time now in a time zone, or null when the database doesn't know it (tzdata changes).
create function private.local_now(p_tz text) returns timestamp
language plpgsql stable set search_path = '' as $$
begin
  return now() at time zone p_tz;
exception when others then
  return null;
end;
$$;

-- Who is due now: the hour they chose has come in their time zone, nothing sent yet today, and
-- today's Daily not solved. Up to p_limit at a time (the sender takes again until none are
-- left). Marks each one sent for today as it is taken, on the row itself, so a retry or an
-- overlapping run never sends twice. A time zone the database no longer knows is skipped, never
-- an error for everyone. For the send-reminders Edge Function only (service role).
create function public.reminders_take(p_limit integer default 200) returns json
language plpgsql security definer set search_path = '' as $$
declare
  due json;
begin
  with local as (
    select r.*, private.local_now(r.tz) as here from private.reminders r
  ), due_now as (
    select l.player_id, l.push, l.email, l.off_token, (l.here - interval '3 hours')::date as today
    from local l
    where l.here is not null and extract(hour from l.here) = l.hour
  ), pending as (
    select d.* from due_now d
    join private.reminders r on r.player_id = d.player_id
    where r.last_sent is distinct from d.today
      and not exists (select 1 from public.games g where g.user_id = d.player_id and g.mode = 'daily' and g.won and g.date_key = d.today)
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  ), marked as (
    update private.reminders r set last_sent = p.today
    from pending p where r.player_id = p.player_id and r.last_sent is distinct from p.today
    returning r.player_id
  )
  select coalesce(json_agg(json_build_object(
      'player', p.player_id,
      'streak', private.daily_streak_before(p.player_id, p.today),
      'email', case when p.email and private.can_email(u) then u.email end,
      'offToken', p.off_token,
      'push', case when p.push then (
        select coalesce(json_agg(json_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::json)
        from private.push_subscriptions s where s.player_id = p.player_id) else '[]'::json end)), '[]'::json)
    into due
  from pending p
  join marked m on m.player_id = p.player_id
  join auth.users u on u.id = p.player_id;
  return due;
end;
$$;

-- A push endpoint the push service says is gone (403 for an old key, 404, 410), or one that isn't a
-- known push service: forgotten. Service role only.
create function public.push_gone(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from private.push_subscriptions where endpoint = p_endpoint;
$$;

-- An email's "turn these off" link: email reminders off for that token's player. Service role only.
create function public.reminder_email_off(p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update private.reminders set email = false, updated_at = now() where off_token = p_token;
  if not found then return false; end if;
  delete from private.reminders where off_token = p_token and not push;
  return true;
end;
$$;

-- The hourly call: posts to send-reminders with the shared secret; without its secrets (a project
-- that hasn't set them up) it does nothing.
create function private.call_reminders() returns void
language plpgsql security definer set search_path = '' as $$
declare
  base text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret');
begin
  if base is null or secret is null then return; end if;
  perform net.http_post(
    url := base || '/functions/v1/send-reminders',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
end;
$$;

-- ---------------------------------------------------------------- schedule (where the extensions are)
do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron;
    perform cron.schedule('daily-reminders', '0 * * * *', 'select private.call_reminders()');
  end if;
end
$do$;

-- Grants: players call their own four; the sender's three are the service role's alone.
revoke all on function public.reminder_get(), public.reminder_set(integer, text, boolean, boolean),
  public.push_subscribe(text, text, text), public.push_unsubscribe(text),
  public.reminders_take(integer), public.push_gone(text), public.reminder_email_off(uuid) from public, anon, authenticated;
grant execute on function public.reminder_get(), public.reminder_set(integer, text, boolean, boolean),
  public.push_subscribe(text, text, text), public.push_unsubscribe(text) to authenticated;
grant execute on function public.reminders_take(integer), public.push_gone(text), public.reminder_email_off(uuid) to service_role;
revoke all on function private.call_reminders(), private.daily_streak_before(uuid, date),
  private.can_email(auth.users), private.push_host_ok(text), private.local_now(text) from public, anon, authenticated;
