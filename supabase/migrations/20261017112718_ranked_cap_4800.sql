-- Ranked targets now reach 4800 (was 3200), so the hardest level-5 puzzles
-- (Finned Jellyfish) can be served to the very best players. Only the top end
-- moves: the lower bounds and every non-Ranked band stay exactly as they were.

create or replace function private.ranked_target(elo integer) returns integer
language sql immutable set search_path = '' as $$
  select least(greatest(elo, 150), 4800);
$$;

-- Ranked: within 350 of the target the server picked. Other modes: the band
-- their (gentler) generation profiles produce. Never outside 100-5200.
create or replace function private.clamp_rating(difficulty text, reported integer, target integer default null) returns integer
language sql immutable set search_path = '' as $$
  select least(greatest(
    case
      when target is not null then least(greatest(coalesce(reported, target), target - 350), target + 350)
      when difficulty = 'easy' then least(greatest(coalesce(reported, 160), 140), 250)
      when difficulty = 'medium' then least(greatest(coalesce(reported, 400), 290), 800)
      else least(greatest(coalesce(reported, 600), 290), 1500)
    end, 100), 5200);
$$;
