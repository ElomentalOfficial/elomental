-- Show founders to players failed from the Dev console ("No connection. Nothing changed."):
-- dev_show_founders refreshes the leaderboard straight away, and private.refresh_lb clears
-- private.lb_meta with a bare `delete`. Supabase's API connections refuse a DELETE or UPDATE
-- with no WHERE (pg_safeupdate: "DELETE requires a WHERE clause"), so the whole call rolled
-- back. The 5-minute cron runs outside the API, which is why the leaderboard never noticed.
-- As in ranked_ladder, with `where true`.

create or replace function private.refresh_lb() returns void
language plpgsql security definer set search_path = '' as $$
declare
  f integer[] := private.tier_floors();
begin
  refresh materialized view concurrently private.lb;
  -- every row (an explicit WHERE: API calls refuse a bare DELETE)
  delete from private.lb_meta where true;
  insert into private.lb_meta (key, n)
    select 'global', count(*) from private.lb
    union all select 'season', count(*) from private.lb where season_rank is not null
    union all select 'faction:' || affinity, count(*) from private.lb where affinity is not null group by affinity
    union all select 'country:' || country, count(*) from private.lb where country is not null group by country
    union all select 'tier:' || f[i], (select count(*) from private.lb l join public.profiles p on p.id = l.id where p.rank_tier = i - 1)
      from generate_subscripts(f, 1) i;
end;
$$;
