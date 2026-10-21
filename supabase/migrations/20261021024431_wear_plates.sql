-- Name plates are kept (owner, 2026-10-21): every plate bought stays yours, and you wear any of
-- them, or none. Was: each plate replaced the last.
--
-- * profiles.plates_owned: the highest plate bought (plates are still bought in order, so this
--   is every plate up to it). profiles.plate stays the plate worn, which the leaderboard, the
--   player card and Home already show; it can't be one you don't own.
-- * buy_plate: goes by plates_owned, and wears the new plate.
-- * wear_plate(n): wear plate n (0: none), any you own. Free.
-- * dev_action 'plate' sets both (owned and worn).

alter table public.profiles add column plates_owned smallint not null default 0 check (plates_owned between 0 and 5);
update public.profiles set plates_owned = plate;
alter table public.profiles add constraint profiles_plate_owned check (plate <= plates_owned);

-- ---------------------------------------------------------------- buy_plate
-- As in diamond_plate, by plates_owned.
create or replace function public.buy_plate(p_plate integer) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  costs constant integer[] := array[1000, 2500, 6000, 9000, 14000];
  cur smallint;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select plates_owned into cur from public.profiles where id = uid for update;
  if cur >= 5 then raise exception 'top_plate'; end if;
  -- a repeated request for a plate already bought does nothing
  if p_plate is null or p_plate <= cur then raise exception 'plate_owned'; end if;
  if p_plate <> cur + 1 then raise exception 'plate_order'; end if;
  update public.profiles set stardust = stardust - costs[p_plate], plates_owned = p_plate, plate = p_plate
    where id = uid and stardust >= costs[p_plate];
  if not found then raise exception 'not_enough_stardust'; end if;
  insert into private.ledger (player_id, reason, ref, stardust) values (uid, 'plate', p_plate::text, -costs[p_plate]);
  return json_build_object('plate', p_plate);
end;
$$;

-- ---------------------------------------------------------------- wear_plate
create function public.wear_plate(p_plate integer) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  update public.profiles set plate = p_plate where id = uid and p_plate between 0 and plates_owned;
  if not found then raise exception 'plate_not_owned'; end if;
  return json_build_object('plate', p_plate);
end;
$$;
revoke execute on function public.wear_plate(integer) from public, anon;
grant execute on function public.wear_plate(integer) to authenticated, service_role;

-- ---------------------------------------------------------------- the founders' tools
-- As in diamond_plate; 'plate' sets the plates owned and wears the top one.
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
      update public.profiles set plates_owned = n, plate = n where id = uid;
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
