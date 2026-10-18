-- Guest (anonymous) accounts play through the server but don't appear on the
-- leaderboard until they sign up with an email.
create or replace function public.leaderboard(p_limit integer default 50)
returns table (rank bigint, display_name text, elo integer, ranked_games integer, is_me boolean)
language sql stable security definer set search_path = '' as $$
  select rank() over (order by p.elo desc), p.display_name, p.elo, p.ranked_games, p.id = auth.uid()
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.ranked_games > 0 and not coalesce(u.is_anonymous, false)
  order by p.elo desc limit least(greatest(p_limit, 1), 100);
$$;
revoke execute on function public.leaderboard(integer) from public, anon;
grant execute on function public.leaderboard(integer) to authenticated;
