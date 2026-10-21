-- Name plates come with the level (owner, 2026-10-21; game-economy-designer, ui-designer,
-- ux-reviewer). A plate is a rule under the name, the level in a medallion on it; plates are no longer
-- bought, they unlock at levels 5, 10, 15, 25, 35, 50, 65, 80 and 100 (9 plates for now,
-- Starforged at the top), all kept, any equipped.
--
-- * The curve: from level L to L+1 costs min(20 x L, 2000) XP (was 50 x L). Reaching level L
--   takes 10 x L x (L - 1) XP up to level 100, then 99,000 + 2,000 x (L - 100). Every XP total
--   stays and gives the same level or a higher one.
-- * private.plates_at(level): how many plates a level has unlocked (0 to 9). profiles.plate is
--   the one worn (0: none), any up to that; plates_owned and buy_plate go.
-- * Plates bought with Stardust are refunded in full, once, from the ledger.
-- * finish_game: a win that unlocks a plate equips it when the player wore their newest one (or
--   none had been unlocked); a player who chose an older plate, or none, keeps that choice. 'xp'
--   gains 'plate': the plate just unlocked, if any.
-- * wear_plate: any plate the level has unlocked. dev_action 'plate' becomes 'level' (sets the
--   XP to a level's total).

-- ---------------------------------------------------------------- the curve
create function private.xp_total(l integer) returns integer
language sql immutable set search_path = '' as $$
  select case when l <= 100 then 10 * l * (l - 1) else 99000 + 2000 * (l - 100) end;
$$;

create or replace function private.xp_level(total integer, out level integer, out into_level integer, out need integer)
language plpgsql immutable set search_path = '' as $$
begin
  total := greatest(coalesce(total, 0), 0);
  if total >= 99000 then
    level := 100 + (total - 99000) / 2000;
  else
    level := greatest(1, floor((1 + sqrt(1 + 0.4 * total)) / 2)::integer);
    -- (exact, whatever the float did)
    while private.xp_total(level + 1) <= total loop level := level + 1; end loop;
    while level > 1 and private.xp_total(level) > total loop level := level - 1; end loop;
  end if;
  into_level := total - private.xp_total(level);
  need := least(20 * level, 2000);
end;
$$;

-- How many plates a level has unlocked.
create function private.plates_at(lvl integer) returns smallint
language sql immutable set search_path = '' as $$
  select count(*)::smallint from unnest(array[5, 10, 15, 25, 35, 50, 65, 80, 100]) m where m <= lvl;
$$;

-- ---------------------------------------------------------------- the refund
-- every plate bought, back in full, once (a plate_refund row per purchase)
insert into private.ledger (player_id, reason, ref, stardust)
  select l.player_id, 'plate_refund', l.ref, -l.stardust
  from private.ledger l
  where l.reason = 'plate' and l.stardust < 0;
update public.profiles p set stardust = p.stardust + s.back
  from (select player_id, sum(stardust)::integer as back from private.ledger where reason = 'plate_refund' group by player_id) s
  where s.player_id = p.id;

-- ---------------------------------------------------------------- plates follow the level
alter table public.profiles drop constraint profiles_plate_owned;
alter table public.profiles drop constraint profiles_plate_check;
alter table public.profiles drop column plates_owned;
-- everyone wears their newest plate to begin with
update public.profiles set plate = private.plates_at((private.xp_level(xp)).level) where true;
alter table public.profiles add constraint profiles_plate_check check (plate between 0 and 9);
drop function public.buy_plate(integer);

create or replace function public.wear_plate(p_plate integer) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  update public.profiles set plate = p_plate
    where id = uid and p_plate between 0 and private.plates_at((private.xp_level(xp)).level);
  if not found then raise exception 'plate_not_owned'; end if;
  return json_build_object('plate', p_plate);
end;
$$;

-- ---------------------------------------------------------------- finish_game
-- As in account_level, with a newly unlocked plate equipped (when the newest was worn).
create or replace function public.finish_game(
  p_game_id uuid,
  p_won boolean,
  p_mistakes integer,
  p_hints integer,
  p_seconds integer,
  p_rating integer,
  p_grid text
) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  dev boolean := private.dev_on(auth.uid());
  g public.games;
  p public.profiles;
  target integer;
  wall integer;
  secs integer;
  min_secs integer;
  v_mistakes integer := least(greatest(coalesce(p_mistakes, 0), 0), 3);
  v_hints integer := least(greatest(coalesce(p_hints, 0), 0), 3);
  dust integer := 0;
  v_spirit boolean := false;
  unrated text := null;
  elo_json json := null;
  daily_json json := null;
  drop_json json := null;
  progress_json json := null;
  influence integer := 0;
  solved_today integer := 0;
  capped boolean := false;
  v_xp integer := 0;
  xp_before integer;
  plates_before smallint;
  plates_now smallint;
  xp_json json := null;
  -- the game's solve audit (audit-solve), kept where the player can't read it
  a jsonb;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into g from public.games where id = p_game_id and user_id = uid for update;
  if not found then raise exception 'no_game'; end if;
  if g.finished_at is not null then raise exception 'already_finished'; end if;
  -- Ranked stored its target rating at start
  target := coalesce(g.target_rating, g.rating);
  select audit into a from private.game_audits where game_id = g.id;

  select c.wall, c.secs into wall, secs from private.finish_clock(g, p_seconds) c;

  if p_won then
    if not private.valid_solution(p_grid) then raise exception 'invalid_solution'; end if;
    -- Nobody fills a whole square this fast by hand (dev mode's instant solve aside).
    min_secs := case g.difficulty when 'easy' then 15 when 'medium' then 30 else 45 end;
    if wall < min_secs and not dev then raise exception 'too_fast'; end if;
  end if;

  unrated := private.ranked_unrated(g, a, p_grid, p_won, dev, wall, target);
  g.rating := private.square_rating(g, a, p_won, unrated, p_rating, target);
  select * into p from public.profiles where id = uid for update;
  xp_before := p.xp;

  -- dev mode counts none
  if p_won then
    solved_today := case when dev then 0 else private.rated_solves_today(uid, g.id) end;
    dust := private.solve_dust(g, unrated, v_mistakes, v_hints, solved_today);
    p.stardust := p.stardust + dust;
  end if;

  if g.mode = 'ranked' then
    g.elo_before := p.elo;
    select e.elo_after, e.elo_json into g.elo_after, elo_json
      from private.ranked_elo(uid, g, a, p.elo, p.ranked_games, p_won, unrated, target, secs, wall, v_hints) e;
    p.elo := g.elo_after;
    p.ranked_games := p.ranked_games + 1;
  end if;

  -- Rated solves count toward the Spirit for the first 9 a day.
  if p_won and unrated is null then
    if solved_today < 9 then
      p.spirit_pity := p.spirit_pity + 1;
      if private.spirit_roll(p.spirit_pity) or (dev and p.dev_next_spirit) then
        v_spirit := true;
        p.spirits := p.spirits + 1;
        p.spirit_pity := 0;
        p.dev_next_spirit := false;
      end if;
    else
      capped := true;
    end if;
    -- XP for every rated win, no daily cap (account_level). A pace guard instead: none when
    -- another XP-paying win finished within this game's minimum solve time (games are played
    -- one after another, so a person never meets it; a script finishing games side by side
    -- does). Dev mode, which skips the speed checks, earns none.
    if not dev and not exists (select 1 from public.games o
         where o.user_id = uid and o.id <> g.id and o.xp > 0
           and o.finished_at > now() - make_interval(secs => min_secs)) then
      v_xp := private.solve_xp(g);
      p.xp := p.xp + v_xp;
    end if;
  end if;

  -- a plate unlocked: equipped when the newest was worn (a chosen older plate, or none, stays)
  plates_before := private.plates_at((private.xp_level(xp_before)).level);
  plates_now := private.plates_at((private.xp_level(p.xp)).level);
  if plates_now > plates_before and p.plate = plates_before then
    p.plate := plates_now;
  end if;

  update public.profiles
    set elo = p.elo, ranked_games = p.ranked_games, stardust = p.stardust, spirits = p.spirits, spirit_pity = p.spirit_pity,
        dev_next_spirit = p.dev_next_spirit, xp = p.xp, plate = p.plate
    where id = uid;
  update public.games
    set finished_at = now(), won = p_won, seconds = secs, mistakes = v_mistakes, hints = v_hints,
        rating = g.rating, elo_before = g.elo_before, elo_after = g.elo_after, stardust = dust, spirit = v_spirit,
        paused_at = null, xp = v_xp
    where id = g.id;
  if dust <> 0 or v_spirit then
    insert into private.ledger (player_id, reason, ref, stardust, spirits)
      values (uid, 'solve', g.id::text, dust, case when v_spirit then 1 else 0 end);
  end if;

  if p_won and unrated is null then
    select c.drop_json, c.progress_json, c.influence into drop_json, progress_json, influence
      from private.count_solve(uid, g, p, solved_today, v_mistakes, v_hints) c;
  end if;

  -- the month so far, and its badge at 20 days (daily_month)
  if g.mode = 'daily' then
    daily_json := private.daily_month(uid, date_trunc('month', g.date_key)::date);
  end if;

  if p_won then
    select json_build_object('gained', v_xp, 'total', p.xp, 'level', n.level, 'into', n.into_level, 'need', n.need,
        'levelUp', n.level > b.level,
        'plate', case when plates_now > plates_before then plates_now end,
        'plateEquipped', plates_now > plates_before and p.plate = plates_now)
      into xp_json
      from private.xp_level(p.xp) n, private.xp_level(xp_before) b;
  end if;

  return json_build_object('seconds', secs, 'dust', dust, 'spirit', v_spirit, 'elo', elo_json, 'daily', daily_json,
    'drop', drop_json, 'progress', progress_json, 'partsCapped', capped,
    'dustCapped', p_won and g.mode in ('casual', 'clash') and solved_today >= 20,
    'influence', case when influence > 0 then json_build_object('affinity', p.affinity, 'amount', influence) end,
    'xp', xp_json);
end;
$$;

-- ---------------------------------------------------------------- the founders' tools
-- As in wear_plates; 'plate' gives way to 'level' (the XP of that level, and its newest plate).
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

revoke execute on all functions in schema private from public, anon, authenticated;
