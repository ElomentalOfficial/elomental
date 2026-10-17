-- Gentler losses at the low end. A conceded or lost square right after the
-- 500 protection cost 45 (×1.5 of the stake); it now starts at half a win and
-- grows with Elo: ×0.5 at 500, ×1 at 1200, ×1.25 at 1600, ×1.5 at 2400 and
-- ×2 from 3200 (straight lines between). Wins and K are unchanged.
-- On a puzzle at the player's rating: 500 → −15, 1000 → −20, 2400 → −12, 3200 → −10.

create or replace function private.elo_loss_multiplier(elo integer) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when elo <= 500 then 0.5
    when elo <= 1200 then 0.5 + 0.5 * (elo - 500) / 700.0
    when elo <= 1600 then 1 + 0.25 * (elo - 1200) / 400.0
    when elo <= 2400 then 1.25 + 0.25 * (elo - 1600) / 800.0
    when elo <= 3200 then 1.5 + 0.5 * (elo - 2400) / 800.0
    else 2
  end;
$$;
