-- Blueprints (docs/PROGRESSION_DESIGN.md, "Collection for the long run"; owner 2026-10-22):
-- a drop is a blueprint you forge with Stardust, cheaply; without one a part costs more.
--
--                      Common  Rare  Epic  Mythic
--   from a blueprint        0    50   200     500   (a Common is one tap)
--   without one           150   375   900    1800
--
-- The drop order (faction_drops) is unchanged, and a blueprint counts as having the part: it
-- isn't drawn again, your faction's frame held as a blueprint lets the gifts come, and a part
-- held either way is a duplicate (Stardust, as before). Parts already owned stay owned.

create table public.player_blueprints (
  player_id uuid not null references public.profiles (id) on delete cascade,
  part_id text not null references public.parts (id) on delete cascade,
  dropped_at timestamptz not null default now(),
  primary key (player_id, part_id)
);
create index player_blueprints_part on public.player_blueprints (part_id);
alter table public.player_blueprints enable row level security;
create policy "Players read their blueprints" on public.player_blueprints
  for select to authenticated using ((select auth.uid()) = player_id);
revoke insert, update, delete, truncate on public.player_blueprints from anon, authenticated;
grant select on public.player_blueprints to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.player_blueprints to service_role;

-- forging without a blueprint
create or replace function private.forge_cost(p_rarity text) returns integer
language sql immutable set search_path = '' as $$
  select case p_rarity when 'common' then 150 when 'rare' then 375 when 'epic' then 900 else 1800 end;
$$;
-- forging from a blueprint
create function private.blueprint_cost(p_rarity text) returns integer
language sql immutable set search_path = '' as $$
  select case p_rarity when 'common' then 0 when 'rare' then 50 when 'epic' then 200 else 500 end;
$$;

-- you have a part when you own it or hold its blueprint
create function private.has_part(p_player uuid, p_part text) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.player_parts where player_id = p_player and part_id = p_part)
      or exists (select 1 from public.player_blueprints where player_id = p_player and part_id = p_part);
$$;

-- As in faction_drops; a new part arrives as a blueprint.
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
      and pt.element = p.affinity and not private.has_part(p_player, pt.id));

  select pt.id, pt.element into v_part, v_element from public.parts pt
    where pt.rarity = v_rarity and pt.source = 'craft' and pt.season_id = private.parts_season()
      and (pt.element is null
        or (p.affinity is not null and (case when own_missing then pt.element = p.affinity else pt.element <> p.affinity end)))
    order by private.rand() * case when private.has_part(p_player, pt.id) then 1 else 3 end desc
    limit 1;

  dup := private.has_part(p_player, v_part);
  if dup then
    dust := case v_rarity when 'common' then 20 when 'rare' then 50 when 'epic' then 120 else 300 end;
    update public.profiles set stardust = stardust + dust where id = p_player;
  else
    insert into public.player_blueprints (player_id, part_id) values (p_player, v_part);
  end if;
  insert into private.ledger (player_id, reason, ref, stardust) values (p_player, case when dup then 'duplicate' else 'blueprint' end, v_part, dust);
  insert into public.drops (game_id, player_id, rarity, part_id, duplicate, stardust, pity_hit)
    values (p_game, p_player, v_rarity, v_part, dup, dust, v_pity);
  return json_build_object('rarity', v_rarity, 'part', v_part, 'duplicate', dup, 'stardust', dust, 'pity', v_pity,
    'blueprint', not dup,
    -- what forging it costs now
    'forge', case when dup then null else private.blueprint_cost(v_rarity) end,
    'gift', v_element is not null and v_element is distinct from p.affinity,
    'guarantee', json_build_object('epic', 10 - p.pity_epic, 'mythic', 25 - p.pity_mythic),
    -- every part of that rarity had: its next drop can only be Stardust
    'complete', (select json_object_agg(r, not exists (
        select 1 from public.parts pt
        where pt.rarity = r and pt.source = 'craft' and pt.season_id = private.parts_season()
          and not private.has_part(p_player, pt.id)))
      from unnest(array['epic', 'mythic']) as r));
end;
$$;

-- As in cycles; from a blueprint at its price, and the blueprint is used up.
create or replace function public.forge_part(p_part text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  pt public.parts;
  cost integer;
  ed integer;
  bp boolean;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into pt from public.parts where id = p_part for update;   -- also numbers editions in order
  if not found or pt.source <> 'craft' then raise exception 'not_forgeable'; end if;
  if pt.season_id is distinct from private.parts_season() then raise exception 'vaulted'; end if;
  if exists (select 1 from public.player_parts where player_id = uid and part_id = p_part) then
    raise exception 'already_owned';
  end if;
  -- the player's row first, so a drop landing at the same moment can't change the price under us
  perform 1 from public.profiles where id = uid for update;
  bp := exists (select 1 from public.player_blueprints where player_id = uid and part_id = p_part);
  cost := case when bp then private.blueprint_cost(pt.rarity) else private.forge_cost(pt.rarity) end;
  update public.profiles set stardust = stardust - cost where id = uid and stardust >= cost;
  if not found then raise exception 'not_enough_stardust'; end if;
  -- first editions: the first 100 forges of a Mythic part are numbered (test accounts don't
  -- count and get no number)
  if not (select test_account from public.profiles where id = uid) then
    if pt.rarity = 'mythic' and pt.editions_forged < 100 then ed := pt.editions_forged + 1; end if;
    update public.parts set editions_forged = editions_forged + 1 where id = p_part;
  end if;
  delete from public.player_blueprints where player_id = uid and part_id = p_part;
  insert into public.player_parts (player_id, part_id, how, edition) values (uid, p_part, 'forge', ed);
  insert into private.ledger (player_id, reason, ref, stardust) values (uid, case when bp then 'forge_blueprint' else 'forge' end, p_part, -cost);
  return json_build_object('part', p_part, 'edition', ed, 'stardust', cost);
end;
$$;

-- As in level_plates; clearing parts clears blueprints too, and forgetting a faction its dates.
create or replace function public.dev_action(p_action text, p_value text default null) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  n integer;
  before public.profiles;
  after public.profiles;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not private.is_admin(uid) then raise exception 'not_admin'; end if;
  if not private.dev_on(uid) then raise exception 'dev_off'; end if;
  select * into before from public.profiles where id = uid for update;
  case p_action
    when 'fill' then
      update public.profiles set stardust = 999999, spirits = 99 where id = uid;
    when 'empty' then
      update public.profiles set stardust = 0, spirits = 0 where id = uid;
    when 'unlock_all' then
      insert into public.player_parts (player_id, part_id, how)
        select uid, id, 'forge' from public.parts where source = 'craft' and season_id = private.parts_season()
        on conflict do nothing;
      delete from public.player_blueprints where player_id = uid;
    when 'clear_parts' then
      delete from public.player_parts where player_id = uid;
      delete from public.player_blueprints where player_id = uid;
      update public.avatar_loadouts set avatar = null, frame = null where player_id = uid;
    when 'level' then
      n := p_value::integer;
      if n not between 1 and 1000 then raise exception 'bad_request'; end if;
      update public.profiles set xp = private.xp_total(n), plate = private.plates_at(n) where id = uid;
    when 'elo' then
      n := p_value::integer;
      if n not between 0 and 2000 then raise exception 'bad_request'; end if;
      update public.profiles set elo = n, rank_tier = private.shown_tier(0::smallint, n), ranked_loss_run = 0 where id = uid;
    when 'next_drop' then
      if p_value not in ('common', 'rare', 'epic', 'mythic') then raise exception 'bad_request'; end if;
      update public.profiles set dev_next_drop = p_value, part_progress = 2 where id = uid;
    when 'next_spirit' then
      update public.profiles set dev_next_spirit = true where id = uid;
    when 'forget_affinity' then
      update public.profiles set affinity = null, affinity_season = null, affinity_since = null, affinity_switched_month = null where id = uid;
    else
      raise exception 'bad_request';
  end case;
  select * into after from public.profiles where id = uid;
  -- every balance change leaves a trail
  if after.stardust <> before.stardust or after.spirits <> before.spirits then
    insert into private.ledger (player_id, reason, ref, stardust, spirits)
      values (uid, 'dev_' || p_action, p_value, after.stardust - before.stardust, after.spirits - before.spirits);
  end if;
  insert into private.founder_log (founder_id, action, detail) values (uid, p_action, p_value);
  return json_build_object('action', p_action);
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
