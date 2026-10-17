-- Elo curve: big gains while learning, tapering through the middle and top,
-- and losses that cost more the higher a player is.
--
-- K by Elo (straight lines between these points): 60 up to 600, 28 at 1600,
-- 16 at 2400, 10 at 3200, 8 at 4800 and above. Replaces the old flat K
-- (40 for the first 20 games, then 24).
-- A loss costs K × expected × 1.5 below 1600, × 1.75 up to 2400, × 2 above.
-- No loss below 500, as before. Speed bonus and hint cut are unchanged (finish_game).
--
-- Simulated (45 min of Ranked a day): a player strong enough for 3500 reaches
-- 1000 in about 5 days (was 10) and 3500 in about 5-8 months (was about 4).

create function private.elo_k(elo integer) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when elo <= 600 then 60
    when elo <= 1600 then 60 - 32 * (elo - 600) / 1000.0
    when elo <= 2400 then 28 - 12 * (elo - 1600) / 800.0
    when elo <= 3200 then 16 - 6 * (elo - 2400) / 800.0
    when elo <= 4800 then 10 - 2 * (elo - 3200) / 1600.0
    else 8
  end;
$$;

create function private.elo_loss_multiplier(elo integer) returns numeric
language sql immutable set search_path = '' as $$
  select case when elo < 1600 then 1.5 when elo < 2400 then 1.75 else 2 end;
$$;

-- Same signature as before (finish_game calls it); games_played is no longer used.
create or replace function private.elo_delta(player integer, puzzle integer, won boolean, games_played integer) returns integer
language plpgsql immutable set search_path = '' as $$
declare
  expected double precision := 1 / (1 + power(10, (puzzle - player) / 400.0));
  k numeric := private.elo_k(player);
begin
  if won then return round(k * (1 - expected)); end if;
  if player < 500 then return 0; end if;
  return -round(k * expected * private.elo_loss_multiplier(player));
end;
$$;
