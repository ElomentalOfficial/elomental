-- The simpler economy (docs/PROGRESSION_DESIGN.md, revised 2026-10-20), replacing the
-- material system from economy_affinity:
--
-- * Rarities Common, Rare, Epic, Mythic. No materials, no refining or swapping.
-- * Every 3rd rated solve drops one whole avatar part (62/28/8/2%); Epic or better is
--   guaranteed within 10 parts, Mythic within 25. Counting stops after 30 solves a day.
-- * A part you already own turns into Stardust (20/50/120/300).
-- * Any missing part of the current season can be forged with Stardust (100/250/600/1200);
--   Mythic also takes a Rusted Crown.
-- * Seasons last 6 months (Jan–Jun, Jul–Dec); Season 0 runs to the end of June 2027.
--   Affinities still settle monthly.
-- * Season 0's set grows to 48 parts: 12 per element.
--
-- Any components a player held are converted into Stardust (and written to the ledger).

-- ---------------------------------------------------------------- materials → Stardust
with worth as (
  select player_id, sum(qty * case rarity when 'scrap' then 2 when 'forged' then 6 when 'tempered' then 20
                                          when 'runed' then 60 else 200 end)::integer as dust
  from public.player_components group by player_id having sum(qty) > 0
), paid as (
  update public.profiles p set stardust = p.stardust + w.dust from worth w where p.id = w.player_id
  returning p.id, w.dust
)
insert into private.ledger (player_id, reason, ref, stardust)
  select id, 'convert', 'materials', dust from paid;

drop function public.refine_components(text, text, integer);
drop function public.swap_components(text, text, text, integer);
drop function private.roll_drop(uuid, uuid, text, numeric, boolean);
drop function private.add_component(uuid, text, text, integer, text, text);
drop table public.player_components;

-- ---------------------------------------------------------------- seasons
update public.seasons set ends_at = '2027-07-01 00:00+00' where id = 0;

-- ---------------------------------------------------------------- the catalogue
-- New rarities on parts (the crest stays free with the affinity).
alter table public.parts drop constraint parts_rarity_check;
drop table public.recipes;

-- Season 0 parts that keep their place under a new id or rarity; owned copies follow.
create temporary table part_moves (old text, new text);
insert into part_moves
  select 's0-frame-' || e, 's0-frame-' || e || '-1' from unnest(array['fire', 'water', 'earth', 'air']) e
  union all select 's0-aura-' || e, 's0-aura-' || e || '-3' from unnest(array['fire', 'water', 'earth', 'air']) e;

-- 12 parts per element: Fire and Water get three Epics and one Mythic, Earth and Air two
-- of each, so the set is 16 Common, 16 Rare, 10 Epic, 6 Mythic.
insert into public.parts (id, slot, element, rarity, season_id, source)
select 's0-' || slot || '-' || e || '-' || n, slot, e,
       case when slot = 'aura' and n = 2 then case when e in ('fire', 'water') then 'epic' else 'mythic' end else rarity end,
       0, 'craft'
from unnest(array['fire', 'water', 'earth', 'air']) as e,
     (values ('backdrop', 1, 'common'), ('backdrop', 2, 'common'), ('backdrop', 3, 'rare'),
             ('frame', 1, 'common'), ('frame', 2, 'rare'), ('frame', 3, 'epic'),
             ('sigil', 1, 'common'), ('sigil', 2, 'rare'), ('sigil', 3, 'epic'),
             ('aura', 1, 'rare'), ('aura', 2, null), ('aura', 3, 'mythic')) as v (slot, n, rarity)
on conflict (id) do update set rarity = excluded.rarity, source = 'craft';
update public.parts set rarity = 'common' where source = 'starter';

update public.player_parts pp set part_id = m.new from part_moves m where pp.part_id = m.old;
update public.avatar_loadouts l set frame = m.new from part_moves m where l.frame = m.old;
update public.avatar_loadouts l set aura = m.new from part_moves m where l.aura = m.old;
delete from public.parts where id in (select old from part_moves);
drop table part_moves;

alter table public.parts add constraint parts_rarity_check check (rarity in ('common', 'rare', 'epic', 'mythic'));

-- The Stardust price of forging a part, by rarity (Mythic also takes a Rusted Crown).
create function private.forge_cost(p_rarity text) returns integer
language sql immutable set search_path = '' as $$
  select case p_rarity when 'common' then 100 when 'rare' then 250 when 'epic' then 600 else 1200 end;
$$;

-- ---------------------------------------------------------------- profiles
alter table public.profiles
  drop column pity_tempered,
  drop column pity_runed,
  drop column pity_starforged,
  drop column win_run,
  drop column run_mode,
  -- rated solves since the last part (a part every 3rd)
  add column part_progress smallint not null default 0,
  -- parts since the last Epic-or-better / Mythic (the guarantees)
  add column pity_epic smallint not null default 0,
  add column pity_mythic smallint not null default 0;

-- ---------------------------------------------------------------- drops
delete from public.drops;
alter table public.drops
  drop column element,
  drop column upgrade_chance,
  drop column upgraded,
  add column stardust integer not null default 0,
  alter column part_id set not null;
alter table public.drops add constraint drops_rarity_check check (rarity in ('common', 'rare', 'epic', 'mythic'));

-- One part for a solve: the rarity rolled (with the guarantees), then a part of that rarity
-- from the season, three times likelier to be one you don't have (and, among those, your
-- affinity's element twice as likely). Already yours: Stardust instead.
create function private.drop_part(p_player uuid, p_game uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  x double precision := private.rand();
  v_rarity text;
  v_pity text;
  v_part text;
  dup boolean;
  dust integer := 0;
begin
  select * into p from public.profiles where id = p_player for update;
  v_rarity := case when x < 0.62 then 'common' when x < 0.90 then 'rare' when x < 0.98 then 'epic' else 'mythic' end;
  if p.pity_mythic + 1 >= 25 and v_rarity <> 'mythic' then v_rarity := 'mythic'; v_pity := 'mythic';
  elsif p.pity_epic + 1 >= 10 and v_rarity in ('common', 'rare') then v_rarity := 'epic'; v_pity := 'epic';
  end if;
  update public.profiles set
    pity_epic = case when v_rarity in ('epic', 'mythic') then 0 else pity_epic + 1 end,
    pity_mythic = case when v_rarity = 'mythic' then 0 else pity_mythic + 1 end
    where id = p_player
    returning pity_epic, pity_mythic into p.pity_epic, p.pity_mythic;

  select pt.id into v_part from public.parts pt
    where pt.rarity = v_rarity and pt.source = 'craft' and pt.season_id = private.current_season()
    order by private.rand()
      * case when exists (select 1 from public.player_parts pp where pp.player_id = p_player and pp.part_id = pt.id) then 1 else 3 end
      * case when pt.element = p.affinity then 2 else 1 end desc
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
    'guarantee', json_build_object('epic', 10 - p.pity_epic, 'mythic', 25 - p.pity_mythic));
end;
$$;

-- ---------------------------------------------------------------- finish_game
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
  g public.games;
  p public.profiles;
  wall integer;
  secs integer;
  min_secs integer;
  v_mistakes integer := least(greatest(coalesce(p_mistakes, 0), 0), 3);
  v_hints integer := least(greatest(coalesce(p_hints, 0), 0), 3);
  base integer;
  dust integer := 0;
  v_crown boolean := false;
  delta integer;
  bonus numeric := 0;
  hint_cut numeric := 0;
  unrated text := null;
  elo_json json := null;
  daily_json json := null;
  drop_json json := null;
  progress_json json := null;
  influence integer := 0;
  solved_today integer;
  month_start date;
  days integer;
  done integer;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into g from public.games where id = p_game_id and user_id = uid for update;
  if not found then raise exception 'no_game'; end if;
  if g.finished_at is not null then raise exception 'already_finished'; end if;

  -- (least() ignores NULLs, so the open pause needs an explicit case.)
  wall := extract(epoch from now() - g.started_at)::integer - g.paused_seconds
    - case when g.paused_at is null then 0 else least(extract(epoch from now() - g.paused_at)::integer, 300) end;
  wall := greatest(wall, 0);
  secs := case when g.mode in ('ranked', 'clash') then wall
               else least(greatest(coalesce(p_seconds, wall), 0), wall) end;

  if p_won then
    if not private.valid_solution(p_grid) then raise exception 'invalid_solution'; end if;
    -- Nobody fills a whole square this fast by hand.
    min_secs := case g.difficulty when 'easy' then 15 when 'medium' then 30 else 45 end;
    if secs < min_secs then raise exception 'too_fast'; end if;
  end if;

  -- A Ranked win needs a clean audit of this very grid.
  if g.mode = 'ranked' and p_won then
    if g.audit is null then unrated := 'unchecked';
    elsif coalesce((g.audit ->> 'copied')::boolean, true) or (g.audit ->> 'solution') is distinct from p_grid then unrated := 'copied';
    end if;
  end if;

  -- Ranked games stored their target rating at start; the puzzle's own rating
  -- (graded by the audit when there is one) must be near it.
  g.rating := private.clamp_rating(g.difficulty,
    coalesce(case when unrated is null then (g.audit ->> 'rating')::integer end, p_rating, g.rating),
    case when g.mode = 'ranked' then g.rating end);
  select * into p from public.profiles where id = uid for update;

  if p_won then
    base := case g.mode when 'daily' then 12 when 'ranked' then 20
              else case g.difficulty when 'easy' then 4 when 'medium' then 8 else 15 end end;
    dust := case when unrated is null then greatest(1, base - v_mistakes * 2 - v_hints) else 1 end;
    p.stardust := p.stardust + dust;
    if unrated is null then
      p.pity := p.pity + 1;
      if p.pity >= 40 or private.rand() < 0.03 then
        v_crown := true;
        p.crowns := p.crowns + 1;
        p.pity := 0;
      end if;
    end if;
  end if;

  if g.mode = 'ranked' then
    g.elo_before := p.elo;
    delta := case when unrated is null then private.elo_delta(p.elo, g.rating, p_won, p.ranked_games) else 0 end;
    if p_won and delta > 0 then
      bonus := private.speed_bonus(secs, g.rating);
      -- Speed bonus first, then the hint cut, so hints can't be earned back by speed.
      hint_cut := least(1, v_hints * 0.25);
    end if;
    delta := round(delta * (1 + bonus) * (1 - hint_cut));
    p.elo := greatest(0, p.elo + delta);
    p.ranked_games := p.ranked_games + 1;
    g.elo_after := p.elo;
    elo_json := json_build_object('before', g.elo_before, 'after', g.elo_after,
      'protectedLoss', not p_won and delta = 0, 'bonus', bonus, 'hintCut', hint_cut, 'unrated', unrated);
    if unrated is not null then
      insert into private.review_flags (user_id, game_id, reason, audit) values (uid, g.id, unrated, g.audit);
    end if;
  end if;

  update public.profiles
    set elo = p.elo, ranked_games = p.ranked_games, stardust = p.stardust, crowns = p.crowns, pity = p.pity
    where id = uid;
  update public.games
    set finished_at = now(), won = p_won, seconds = secs, mistakes = v_mistakes, hints = v_hints,
        rating = g.rating, elo_before = g.elo_before, elo_after = g.elo_after, stardust = dust, crown = v_crown,
        paused_at = null
    where id = g.id;
  if dust <> 0 or v_crown then
    insert into private.ledger (player_id, reason, ref, stardust, crowns)
      values (uid, 'solve', g.id::text, dust, case when v_crown then 1 else 0 end);
  end if;

  -- Rated solves count toward the next part and the player's affinity (first 30 a day, UTC).
  if p_won and unrated is null then
    select count(*) into solved_today from public.games
      where user_id = uid and won and finished_at >= date_trunc('day', now()) and id <> g.id;
    if solved_today < 30 then
      update public.profiles set part_progress = (part_progress + 1) % 3 where id = uid
        returning part_progress into p.part_progress;
      if p.part_progress = 0 then drop_json := private.drop_part(uid, g.id); end if;
      progress_json := json_build_object('count', p.part_progress, 'every', 3);
    end if;

    if p.affinity is not null and solved_today < 25 then
      influence := case g.mode
          when 'daily' then 4
          when 'ranked' then 3 + least(3, g.rating / 1000)
          when 'clash' then 3
          else case g.difficulty when 'easy' then 1 when 'medium' then 2 else 3 end
        end + case when v_mistakes = 0 and v_hints = 0 then 1 else 0 end;
      insert into public.affinity_months (month, player_id, affinity, influence, solves)
        values (date_trunc('month', now())::date, uid, p.affinity, influence, 1)
      on conflict (month, player_id, affinity) do update
        set influence = public.affinity_months.influence + excluded.influence,
            solves = public.affinity_months.solves + 1;
    end if;
  end if;

  if g.mode = 'daily' then
    month_start := date_trunc('month', g.date_key)::date;
    days := extract(day from (month_start + interval '1 month - 1 day'))::integer;
    select count(*) into done from public.games
      where user_id = uid and mode = 'daily' and won
        and date_key >= month_start and date_key < (month_start + interval '1 month')::date;
    daily_json := json_build_object('done', done, 'days', days, 'monthComplete', done = days);
  end if;

  return json_build_object('seconds', secs, 'dust', dust, 'crown', v_crown, 'elo', elo_json, 'daily', daily_json,
    'drop', drop_json, 'progress', progress_json,
    'influence', case when influence > 0 then json_build_object('affinity', p.affinity, 'amount', influence) end);
end;
$$;

-- ---------------------------------------------------------------- forging
create or replace function public.forge_part(p_part text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  pt public.parts;
  cost integer;
  v_crowns smallint;
  ed integer;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into pt from public.parts where id = p_part for update;   -- also numbers editions in order
  if not found or pt.source <> 'craft' then raise exception 'not_forgeable'; end if;
  if pt.season_id is distinct from private.current_season() then raise exception 'vaulted'; end if;
  if exists (select 1 from public.player_parts where player_id = uid and part_id = p_part) then
    raise exception 'already_owned';
  end if;
  cost := private.forge_cost(pt.rarity);
  v_crowns := case when pt.rarity = 'mythic' then 1 else 0 end;
  update public.profiles set stardust = stardust - cost, crowns = crowns - v_crowns
    where id = uid and stardust >= cost and crowns >= v_crowns;
  if not found then raise exception 'not_enough_stardust'; end if;
  -- first editions: the first 100 forges of a Mythic part are numbered
  if pt.rarity = 'mythic' and pt.editions_forged < 100 then ed := pt.editions_forged + 1; end if;
  update public.parts set editions_forged = editions_forged + 1 where id = p_part;
  insert into public.player_parts (player_id, part_id, how, edition) values (uid, p_part, 'forge', ed);
  insert into private.ledger (player_id, reason, ref, stardust, crowns) values (uid, 'forge', p_part, -cost, -v_crowns);
  return json_build_object('part', p_part, 'edition', ed);
end;
$$;

-- choose_affinity hands out s0-crest-<element>: unchanged.

-- ---------------------------------------------------------------- grants
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.forge_part(text) from public, anon;
grant execute on function public.forge_part(text) to authenticated;
