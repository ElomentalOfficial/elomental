-- Name plates: a fifth plate, Diamond, between Gold and Starforged (owner, 2026-10-21; the plates
-- are now drawn as a rule under the name, packages/web/src/plates.ts).
--
-- * Plates are 0 to 5: Bronze, Silver, Gold, Diamond, Starforged. Starforged moves from 4 to 5,
--   so everyone who holds it keeps it (and Diamond, by order, as Starforged replaces it).
-- * buy_plate: Diamond's price and Starforged's, still bought in order, one at a time.
-- * dev_action 'plate' takes 0 to 5.
-- The ledger keeps its history as written: a 'plate' row with ref '4' before this migration was
-- Starforged.

alter table public.profiles drop constraint profiles_plate_check;
update public.profiles set plate = 5 where plate = 4;
alter table public.profiles add constraint profiles_plate_check check (plate between 0 and 5);

-- ---------------------------------------------------------------- buy_plate
-- As in review_integrity, with five plates.
create or replace function public.buy_plate(p_plate integer) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  costs constant integer[] := array[1000, 2500, 6000, 9000, 14000];
  cur smallint;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select plate into cur from public.profiles where id = uid for update;
  if cur >= 5 then raise exception 'top_plate'; end if;
  -- a repeated request for a plate already bought does nothing
  if p_plate is null or p_plate <= cur then raise exception 'plate_owned'; end if;
  if p_plate <> cur + 1 then raise exception 'plate_order'; end if;
  update public.profiles set stardust = stardust - costs[p_plate], plate = p_plate
    where id = uid and stardust >= costs[p_plate];
  if not found then raise exception 'not_enough_stardust'; end if;
  insert into private.ledger (player_id, reason, ref, stardust) values (uid, 'plate', p_plate::text, -costs[p_plate]);
  return json_build_object('plate', p_plate);
end;
$$;

-- ---------------------------------------------------------------- the founders' tools
-- As in ranked_ladder; 'plate' takes 0 to 5.
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
        select uid, id, 'forge' from public.parts where source = 'craft' and season_id = private.current_season()
        on conflict do nothing;
    when 'clear_parts' then
      delete from public.player_parts where player_id = uid;
      update public.avatar_loadouts set avatar = null, frame = null where player_id = uid;
    when 'plate' then
      n := p_value::integer;
      if n not between 0 and 5 then raise exception 'bad_request'; end if;
      update public.profiles set plate = n where id = uid;
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
      update public.profiles set affinity = null, affinity_season = null where id = uid;
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
