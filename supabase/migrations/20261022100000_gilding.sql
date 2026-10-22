-- Gilding (docs/PROGRESSION_DESIGN.md, "Collection for the long run"; owner 2026-10-22): a frame
-- with 3 marks (marks: 120 rated wins while worn) can be gilded once, for Stardust:
-- Common 1000, Rare 1500, Epic 2500, Mythic 4000. A gilt rim shows round it wherever it's worn:
-- the player's own screens, the leaderboard and their card.

alter table public.player_parts add column gilded boolean not null default false;

create function private.gild_cost(p_rarity text) returns integer
language sql immutable set search_path = '' as $$
  select case p_rarity when 'common' then 1000 when 'rare' then 1500 when 'epic' then 2500 else 4000 end;
$$;

create function public.gild_part(p_part text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  pt public.parts;
  pp public.player_parts;
  cost integer;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into pt from public.parts where id = p_part;
  if not found or pt.slot <> 'frame' then raise exception 'not_gildable'; end if;
  perform 1 from public.profiles where id = uid for update;
  select * into pp from public.player_parts where player_id = uid and part_id = p_part for update;
  if not found then raise exception 'not_owned'; end if;
  if pp.gilded then raise exception 'already_gilded'; end if;
  if pp.wins < 120 then raise exception 'needs_marks'; end if;
  cost := private.gild_cost(pt.rarity);
  update public.profiles set stardust = stardust - cost where id = uid and stardust >= cost;
  if not found then raise exception 'not_enough_stardust'; end if;
  update public.player_parts set gilded = true where player_id = uid and part_id = p_part;
  insert into private.ledger (player_id, reason, ref, stardust) values (uid, 'gild', p_part, -cost);
  return json_build_object('part', p_part, 'stardust', cost);
end;
$$;

-- Which of these players wear a gilded frame (the leaderboard's rows, a player's card): only that,
-- for at most 100 players at a time.
create function public.gilt_players(p_ids uuid[]) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(l.player_id), '{}')
    from public.avatar_loadouts l
    join public.player_parts pp on pp.player_id = l.player_id and pp.part_id = l.frame
    where l.player_id = any(p_ids[1:100]) and pp.gilded;
$$;

revoke execute on function public.gild_part(text), public.gilt_players(uuid[]) from public, anon;
grant execute on function public.gild_part(text), public.gilt_players(uuid[]) to authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
