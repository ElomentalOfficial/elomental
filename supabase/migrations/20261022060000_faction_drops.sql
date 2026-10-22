-- Faction drops (docs/PROGRESSION_DESIGN.md, "Collection for the long run"; owner 2026-10-22):
-- your faction's frames first, then the other factions' frames as gifts.
--
-- At the rolled rarity, the pool is that rarity's avatars (they belong to no element) plus:
--   * your faction's frame, while you're missing it;
--   * once you own it, the other factions' frames, each a gift.
-- A player with no faction yet draws avatars only. A part you're missing stays three times as
-- likely as one you own. A player who stays in one faction still collects every frame, so
-- switching gains nothing. Rarity, guarantees, duplicates and the daily limit are unchanged.
-- The drop's json says when it's a gift (the result shows "A gift from Fire").

create or replace function private.drop_part(p_player uuid, p_game uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  x double precision := private.rand();
  v_rarity text;
  v_pity text;
  v_part text;
  v_element text;
  own_missing boolean;
  dup boolean;
  dust integer := 0;
begin
  select * into p from public.profiles where id = p_player for update;
  v_rarity := case when x < 0.62 then 'common' when x < 0.90 then 'rare' when x < 0.98 then 'epic' else 'mythic' end;
  if p.pity_mythic + 1 >= 25 and v_rarity <> 'mythic' then v_rarity := 'mythic'; v_pity := 'mythic';
  elsif p.pity_epic + 1 >= 10 and v_rarity in ('common', 'rare') then v_rarity := 'epic'; v_pity := 'epic';
  end if;
  -- dev mode: the rarity the founder asked for, once
  if p.dev_next_drop is not null and private.dev_on(p_player) then
    v_rarity := p.dev_next_drop;
    v_pity := null;
  end if;
  update public.profiles set
    pity_epic = case when v_rarity in ('epic', 'mythic') then 0 else pity_epic + 1 end,
    pity_mythic = case when v_rarity = 'mythic' then 0 else pity_mythic + 1 end,
    dev_next_drop = null
    where id = p_player
    returning pity_epic, pity_mythic into p.pity_epic, p.pity_mythic;

  -- your faction's frame at this rarity still to collect?
  own_missing := p.affinity is not null and exists (
    select 1 from public.parts pt
    where pt.rarity = v_rarity and pt.source = 'craft' and pt.season_id = private.parts_season()
      and pt.element = p.affinity
      and not exists (select 1 from public.player_parts pp where pp.player_id = p_player and pp.part_id = pt.id));

  select pt.id, pt.element into v_part, v_element from public.parts pt
    where pt.rarity = v_rarity and pt.source = 'craft' and pt.season_id = private.parts_season()
      and (pt.element is null
        or (p.affinity is not null and (case when own_missing then pt.element = p.affinity else pt.element <> p.affinity end)))
    order by private.rand()
      * case when exists (select 1 from public.player_parts pp where pp.player_id = p_player and pp.part_id = pt.id) then 1 else 3 end desc
    limit 1;

  insert into public.player_parts (player_id, part_id, how) values (p_player, v_part, 'drop') on conflict do nothing;
  dup := not found;
  if dup then
    dust := case v_rarity when 'common' then 20 when 'rare' then 50 when 'epic' then 120 else 300 end;
    update public.profiles set stardust = stardust + dust where id = p_player;
  end if;
  insert into private.ledger (player_id, reason, ref, stardust) values (p_player, case when dup then 'duplicate' else 'drop' end, v_part, dust);
  insert into public.drops (game_id, player_id, rarity, part_id, duplicate, stardust, pity_hit)
    values (p_game, p_player, v_rarity, v_part, dup, dust, v_pity);
  return json_build_object('rarity', v_rarity, 'part', v_part, 'duplicate', dup, 'stardust', dust, 'pity', v_pity,
    -- another faction's frame: a gift (never for a player without a faction: they draw avatars)
    'gift', v_element is not null and v_element is distinct from p.affinity,
    'guarantee', json_build_object('epic', 10 - p.pity_epic, 'mythic', 25 - p.pity_mythic),
    -- every part of that rarity owned: its next drop can only be Stardust
    'complete', (select json_object_agg(r, not exists (
        select 1 from public.parts pt
        where pt.rarity = r and pt.source = 'craft' and pt.season_id = private.parts_season()
          and not exists (select 1 from public.player_parts pp where pp.player_id = p_player and pp.part_id = pt.id)))
      from unnest(array['epic', 'mythic']) as r));
end;
$$;
