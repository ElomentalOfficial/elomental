-- Full review, batch B1 follow-up: a side with no counted members showed 300 influence in
-- the standings (least() skips NULLs, so least(NULL, 300) is 300). Display only: the standing,
-- the winners and the payout were already right. Same function, influence counted only for
-- real member rows.

create or replace function private.standings(p_month date) returns table (affinity text, members integer, influence bigint, standing numeric)
language sql stable set search_path = '' as $$
  select e.affinity,
         count(m.player_id)::integer,
         -- the influence that counts, so "players · influence · each" adds up
         coalesce(sum(least(m.influence, 300)) filter (where m.player_id is not null), 0)::bigint,
         round(coalesce(sum(least(m.influence, 300)) filter (where m.player_id is not null)::numeric / nullif(count(m.player_id), 0), 0), 2)
  from unnest(array['fire', 'water', 'earth', 'air']) as e (affinity)
  left join (
    select a.* from public.affinity_months a join public.profiles p on p.id = a.player_id
    where a.month = p_month and a.solves >= 5 and not p.test_account
  ) m on m.affinity = e.affinity
  group by e.affinity;
$$;

revoke execute on function private.standings(date) from public, anon, authenticated;
