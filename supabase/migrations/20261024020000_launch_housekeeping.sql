-- Launch housekeeping (2026-10-24, the capacity model for a launch of 50,000 sign-ups).
--
-- 1. Guest accounts that went quiet are deleted. Supabase never deletes anonymous users itself,
--    and since the app makes a guest's account on first need (web: account.ts ensureAccount)
--    every guest who played once keeps a row. Idle = no sign-in, no session refreshed and no game
--    started in 30 days. A guest's own things go with them (profiles cascade); the square codes
--    and clashes they made stay, unowned (set null). Kept whatever their age, because others
--    rely on what they left: a guest who played a clash (a friend's clash keeps both times), who
--    placed in a season (season_results is history), who gave influence to a faction month that
--    may not be settled yet (this month or last), or who has review flags or a Ranked
--    restriction (the evidence stays). Daily at 04:20 UTC, at most 1,000 a run.
-- 2. Daily reminders run every 15 minutes instead of hourly. send-reminders now sends at most
--    800 players a run (an Edge Function has 2 s of CPU per call, about 1 ms a push), so a busy
--    hour is spread over its four runs; reminders_take still marks each one sent once a day.

-- The deletes cascade through these by player: without a player-first index each one scans them.
create index affinity_months_player on public.affinity_months (player_id);
create index season_results_player on public.season_results (player_id);

create function private.delete_idle_guests(p_limit integer default 1000) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  gone integer;
begin
  with idle as (
    select u.id from auth.users u
    where u.is_anonymous
      and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '30 days'
      and not exists (
        select 1 from auth.sessions s where s.user_id = u.id
          and greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC') >= now() - interval '30 days')
      and not exists (
        select 1 from public.games g where g.user_id = u.id
          and (g.started_at >= now() - interval '30 days' or g.clash_code is not null))
      and not exists (select 1 from public.season_results r where r.player_id = u.id)
      and not exists (select 1 from public.affinity_months a where a.player_id = u.id
                        and a.month >= date_trunc('month', now() - interval '1 month'))
      and not exists (select 1 from private.review_flags f where f.user_id = u.id)
      and not exists (select 1 from private.ranked_restrictions x where x.user_id = u.id)
    limit greatest(1, least(coalesce(p_limit, 1000), 5000))
  )
  delete from auth.users u using idle where u.id = idle.id;
  get diagnostics gone = row_count;
  return gone;
end;
$$;
revoke all on function private.delete_idle_guests(integer) from public, anon, authenticated;

do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('idle-guests', '20 4 * * *', 'select private.delete_idle_guests()');
    -- the same job, every 15 minutes (cron.schedule replaces a job of the same name)
    perform cron.schedule('daily-reminders', '*/15 * * * *', 'select private.call_reminders()');
  end if;
end
$do$;
