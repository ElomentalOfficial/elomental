-- Phase 1 economy and affinities (docs/PROGRESSION_DESIGN.md §2–4, §9–11, §13).
--
-- Every solved, rated square rolls one drop on the server: a component (an element
-- material at a rarity) or, for a quarter of Tempered-or-better drops, a finished
-- avatar part. Three pity counters cap bad luck. Components plus Stardust forge parts;
-- refine (5 → 1 up) and swap (3 → 1 across) burn surplus. Players pick an affinity
-- (Fire, Water, Earth, Air) after their third solve; each solve adds influence to it
-- for the monthly tug of war. The Rusted Crown roll and its pity (profiles.pity) are
-- unchanged and become the catalyst for Runed and Starforged recipes.
--
-- Every change to Stardust, Crowns or components is written to private.ledger.
-- Rolls use pgcrypto (extensions.gen_random_bytes), never a client value.

-- ---------------------------------------------------------------- profiles
alter table public.profiles
  add column pity_tempered smallint not null default 0,
  add column pity_runed smallint not null default 0,
  add column pity_starforged smallint not null default 0,
  -- consecutive solves in the same mode (drop luck, §2.2)
  add column win_run smallint not null default 0,
  add column run_mode text,
  add column affinity text check (affinity in ('fire', 'water', 'earth', 'air')),
  add column affinity_season smallint;
comment on column public.profiles.pity is 'Rated solves since the last Rusted Crown; one is guaranteed at 40.';

-- ---------------------------------------------------------------- seasons
create table public.seasons (
  id smallint primary key,
  element text check (element in ('fire', 'water', 'earth', 'air')),   -- spotlight; none for Season 0
  starts_at timestamptz not null,
  ends_at timestamptz not null
);
insert into public.seasons (id, element, starts_at, ends_at)
  values (0, null, '2026-10-20 00:00+00', '2027-01-05 00:00+00');

create function private.current_season() returns smallint
language sql stable set search_path = '' as $$
  select coalesce((select id from public.seasons where now() >= starts_at and now() < ends_at
                   order by id desc limit 1), 0)::smallint;
$$;

-- ---------------------------------------------------------------- catalogue
create table public.parts (
  id text primary key,
  slot text not null check (slot in ('backdrop', 'sigil', 'frame', 'crest', 'aura')),
  element text not null check (element in ('fire', 'water', 'earth', 'air')),
  rarity text not null check (rarity in ('forged', 'tempered', 'runed', 'starforged')),
  season_id smallint references public.seasons (id),
  -- craft: forged from components; starter: the affinity crest, given on choosing
  source text not null check (source in ('craft', 'starter', 'rank', 'achievement', 'event', 'daily')),
  editions_forged integer not null default 0
);
create table public.recipes (
  part_id text primary key references public.parts (id) on delete cascade,
  components jsonb not null,           -- {"tempered": 7, "runed": 4}, of the part's own element
  stardust integer not null,
  crowns smallint not null default 0
);

-- Season 0: seven parts per element (crest free with the affinity, six forgeable).
insert into public.parts (id, slot, element, rarity, season_id, source)
select 's0-' || slot || '-' || e || suffix, slot, e, rarity, 0, source
from unnest(array['fire', 'water', 'earth', 'air']) as e,
     (values ('crest', '', 'forged', 'starter'),
             ('backdrop', '-1', 'forged', 'craft'),
             ('backdrop', '-2', 'tempered', 'craft'),
             ('frame', '', 'forged', 'craft'),
             ('sigil', '-1', 'tempered', 'craft'),
             ('sigil', '-2', 'runed', 'craft'),
             ('aura', '', 'starforged', 'craft')) as v (slot, suffix, rarity, source);

insert into public.recipes (part_id, components, stardust, crowns)
select id,
  case rarity when 'forged' then '{"scrap": 10, "forged": 4}'::jsonb
              when 'tempered' then '{"forged": 9, "tempered": 4}'::jsonb
              when 'runed' then '{"tempered": 7, "runed": 4}'::jsonb
              else '{"runed": 4, "starforged": 2}'::jsonb end,
  case rarity when 'forged' then 80 when 'tempered' then 300 when 'runed' then 900 else 2400 end,
  case rarity when 'runed' then 1 when 'starforged' then 2 else 0 end
from public.parts where source = 'craft';

-- ---------------------------------------------------------------- inventory
create table public.player_components (
  player_id uuid not null references public.profiles (id) on delete cascade,
  element text not null check (element in ('fire', 'water', 'earth', 'air')),
  rarity text not null check (rarity in ('scrap', 'forged', 'tempered', 'runed', 'starforged')),
  qty integer not null default 0 check (qty >= 0),
  primary key (player_id, element, rarity)
);
create table public.player_parts (
  player_id uuid not null references public.profiles (id) on delete cascade,
  part_id text not null references public.parts (id),
  acquired_at timestamptz not null default now(),
  how text not null check (how in ('forge', 'drop', 'starter')),
  edition integer,                     -- No. 1–100: the first forges of a Starforged part
  primary key (player_id, part_id)
);
create index player_parts_part on public.player_parts (part_id);
create table public.avatar_loadouts (
  player_id uuid primary key references public.profiles (id) on delete cascade,
  backdrop text references public.parts (id),
  sigil text references public.parts (id),
  frame text references public.parts (id),
  crest text references public.parts (id),
  aura text references public.parts (id)
);

-- One drop per game, ever.
create table public.drops (
  game_id uuid primary key references public.games (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  rarity text not null,
  element text not null,
  part_id text references public.parts (id),
  duplicate boolean not null default false,
  upgrade_chance numeric(4, 3) not null,
  upgraded boolean not null default false,
  pity_hit text,
  created_at timestamptz not null default now()
);
create index drops_player_created on public.drops (player_id, created_at desc);

create table private.ledger (
  id bigserial primary key,
  player_id uuid not null,
  at timestamptz not null default now(),
  reason text not null,                -- solve, drop, smelt, forge, refine, swap
  ref text,
  stardust integer not null default 0,
  crowns integer not null default 0,
  components jsonb
);
create index ledger_player_at on private.ledger (player_id, at desc);
alter table private.ledger enable row level security;

-- Influence per player per month (the war, §13).
create table public.affinity_months (
  month date not null,
  player_id uuid not null references public.profiles (id) on delete cascade,
  affinity text not null check (affinity in ('fire', 'water', 'earth', 'air')),
  influence integer not null default 0,
  solves integer not null default 0,
  -- by affinity too: after a switch, past influence stays with the old element
  primary key (month, player_id, affinity)
);
create index affinity_months_month_affinity on public.affinity_months (month, affinity);

-- ---------------------------------------------------------------- access
alter table public.seasons enable row level security;
alter table public.parts enable row level security;
alter table public.recipes enable row level security;
alter table public.player_components enable row level security;
alter table public.player_parts enable row level security;
alter table public.avatar_loadouts enable row level security;
alter table public.drops enable row level security;
alter table public.affinity_months enable row level security;

create policy "Everyone reads the seasons" on public.seasons for select to authenticated using (true);
create policy "Everyone reads the parts" on public.parts for select to authenticated using (true);
create policy "Everyone reads the recipes" on public.recipes for select to authenticated using (true);
create policy "Players read their components" on public.player_components
  for select to authenticated using ((select auth.uid()) = player_id);
create policy "Players read their parts" on public.player_parts
  for select to authenticated using ((select auth.uid()) = player_id);
create policy "Players read their loadout" on public.avatar_loadouts
  for select to authenticated using ((select auth.uid()) = player_id);
create policy "Players read their drops" on public.drops
  for select to authenticated using ((select auth.uid()) = player_id);
create policy "Players read their influence" on public.affinity_months
  for select to authenticated using ((select auth.uid()) = player_id);

revoke insert, update, delete, truncate on public.seasons, public.parts, public.recipes,
  public.player_components, public.player_parts, public.avatar_loadouts, public.drops,
  public.affinity_months from anon, authenticated;
revoke all on public.seasons, public.parts, public.recipes, public.player_components,
  public.player_parts, public.avatar_loadouts, public.drops, public.affinity_months from anon;

-- ---------------------------------------------------------------- helpers
-- Uniform [0, 1) from the crypto source.
create function private.rand() returns double precision
language sql volatile set search_path = '' as $$
  select ('x' || encode(extensions.gen_random_bytes(7), 'hex'))::bit(56)::bigint / 72057594037927936.0;
$$;

create function private.add_component(p_player uuid, p_element text, p_rarity text, p_qty integer,
                                      p_reason text, p_ref text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_qty < 0 then
    -- spending: a plain update (an upsert would check qty >= 0 on the would-be insert first)
    update public.player_components set qty = qty + p_qty
      where player_id = p_player and element = p_element and rarity = p_rarity and qty + p_qty >= 0;
    if not found then raise exception 'not_enough_components'; end if;
  else
    insert into public.player_components (player_id, element, rarity, qty)
      values (p_player, p_element, p_rarity, p_qty)
    on conflict (player_id, element, rarity) do update set qty = public.player_components.qty + p_qty;
  end if;
  insert into private.ledger (player_id, reason, ref, components)
    values (p_player, p_reason, p_ref, jsonb_build_object(p_element || '.' || p_rarity, p_qty));
end;
$$;

-- The drop for one solved game (§2). p_u: the upgrade chance from how it was played.
create function private.roll_drop(p_player uuid, p_game uuid, p_mode text, p_u numeric, p_easy boolean)
returns json language plpgsql security definer set search_path = '' as $$
declare
  tiers constant text[] := array['scrap', 'forged', 'tempered', 'runed', 'starforged'];
  base constant double precision[] := array[0.62, 0.25, 0.095, 0.03, 0.005];
  mode_el text := case p_mode when 'ranked' then 'fire' when 'clash' then 'water'
                              when 'daily' then 'earth' else 'air' end;
  others text[];
  p public.profiles;
  today integer;
  x double precision;
  t integer := 1;
  u numeric := least(greatest(coalesce(p_u, 0), 0), 0.30);
  upgraded boolean := false;
  pity_hit text;
  el text;
  part text;
  dup boolean := false;
  smelt integer := 0;
begin
  -- Pace (UTC day): 1–25 every solve, 26–50 one in three, then none.
  select count(*) into today from public.drops
    where player_id = p_player and created_at >= date_trunc('day', now());
  if today >= 50 or (today >= 25 and private.rand() >= 1.0 / 3) then return null; end if;

  select * into p from public.profiles where id = p_player for update;

  -- base roll, then at most one upgrade
  x := private.rand();
  while t < 5 and x >= base[t] loop x := x - base[t]; t := t + 1; end loop;
  if t < 5 and not p_easy and private.rand() < u then t := t + 1; upgraded := true; end if;

  if p_easy then
    t := least(t, 2);                    -- Casual Easy: Forged at most, no pity
  elsif today < 25 then                  -- pity only on full-value drops, highest first
    if p.pity_starforged + 1 >= 160 and t < 5 then t := 5; pity_hit := 'starforged';
    elsif p.pity_runed + 1 >= 40 and t < 4 then t := 4; pity_hit := 'runed';
    elsif p.pity_tempered + 1 >= 10 and t < 3 then t := 3; pity_hit := 'tempered';
    end if;
    p.pity_starforged := case when t >= 5 then 0 else p.pity_starforged + 1 end;
    p.pity_runed := case when t >= 4 then 0 else p.pity_runed + 1 end;
    p.pity_tempered := case when t >= 3 then 0 else p.pity_tempered + 1 end;
    update public.profiles
      set pity_tempered = p.pity_tempered, pity_runed = p.pity_runed, pity_starforged = p.pity_starforged
      where id = p_player;
  end if;

  -- element: half the mode's; otherwise your affinity a little more often than the rest
  others := array_remove(array['fire', 'water', 'earth', 'air'], mode_el);
  el := case
    when private.rand() < 0.5 then mode_el
    when p.affinity is not null and p.affinity <> mode_el and private.rand() < 0.1 then p.affinity
    else others[1 + floor(private.rand() * 3)::integer]
  end;

  -- a quarter of Tempered+ drops are a finished part; owned parts weigh four times less
  if t >= 3 and private.rand() < 0.25 then
    select pt.id into part from public.parts pt
      where pt.rarity = tiers[t] and pt.element = el and pt.source = 'craft'
        and pt.season_id = private.current_season()
      order by (exists (select 1 from public.player_parts pp
                        where pp.player_id = p_player and pp.part_id = pt.id))::integer * 3
               + private.rand()
      limit 1;
  end if;

  if part is not null then
    insert into public.player_parts (player_id, part_id, how) values (p_player, part, 'drop')
      on conflict do nothing;
    if not found then                    -- already yours: smelted into Stardust and a component
      dup := true;
      smelt := case tiers[t] when 'tempered' then 120 when 'runed' then 400 else 1200 end;
      update public.profiles set stardust = stardust + smelt where id = p_player;
      insert into private.ledger (player_id, reason, ref, stardust) values (p_player, 'smelt', part, smelt);
      perform private.add_component(p_player, el, tiers[t], 1, 'smelt', part);
    end if;
  else
    perform private.add_component(p_player, el, tiers[t], 1, 'drop', p_game::text);
  end if;

  insert into public.drops (game_id, player_id, rarity, element, part_id, duplicate, upgrade_chance, upgraded, pity_hit)
    values (p_game, p_player, tiers[t], el, part, dup, u, upgraded, pity_hit);

  return json_build_object(
    'rarity', tiers[t], 'element', el, 'part', part, 'duplicate', dup, 'smelted', smelt,
    'upgraded', upgraded, 'pity', pity_hit,
    'pityLeft', case when p_easy then null else json_build_object(
      'tempered', 10 - p.pity_tempered, 'runed', 40 - p.pity_runed, 'starforged', 160 - p.pity_starforged) end);
end;
$$;

-- ---------------------------------------------------------------- finish_game
-- As before (solve_audit_enforce), plus: the win run, the drop and affinity influence.
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
  influence integer := 0;
  solved_today integer;
  u numeric := 0;
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
    -- consecutive solves in the same mode
    p.win_run := case when p.run_mode = g.mode then least(p.win_run + 1, 100) else 1 end;
    p.run_mode := g.mode;
  else
    p.win_run := 0;
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
    set elo = p.elo, ranked_games = p.ranked_games, stardust = p.stardust, crowns = p.crowns, pity = p.pity,
        win_run = p.win_run, run_mode = p.run_mode
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

  -- The drop and influence: rated solves only.
  if p_won and unrated is null then
    -- upgrade chance from how it was played (§2.2)
    u := case g.mode
           when 'ranked' then 0.08 + case when g.rating >= g.elo_before + 100 then 0.04 else 0 end
           when 'daily' then 0.12
           when 'clash' then 0.08
           else case g.difficulty when 'easy' then 0 when 'medium' then 0.05 else 0.08 end
         end
       + case when v_mistakes = 0 and v_hints = 0 then 0.04 else 0 end
       + case when bonus > 0 then 0.02 else 0 end
       + least(0.05, 0.01 * greatest(p.win_run - 1, 0))
       - 0.03 * v_hints - 0.01 * v_mistakes;
    drop_json := private.roll_drop(uid, g.id, g.mode, u, g.mode = 'casual' and g.difficulty = 'easy');

    -- Influence counts on the first 25 solves of the (UTC) day.
    if p.affinity is not null then
      select count(*) into solved_today from public.games
        where user_id = uid and won and finished_at >= date_trunc('day', now()) and id <> g.id;
      if solved_today < 25 then
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
    'drop', drop_json,
    'influence', case when influence > 0 then json_build_object('affinity', p.affinity, 'amount', influence) end);
end;
$$;

-- ---------------------------------------------------------------- forging
create function public.forge_part(p_part text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  pt public.parts;
  r public.recipes;
  v_tier text;
  v_need integer;
  have integer;
  ed integer;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into pt from public.parts where id = p_part for update;   -- also numbers editions in order
  if not found or pt.source <> 'craft' then raise exception 'not_forgeable'; end if;
  if pt.season_id is distinct from private.current_season() then raise exception 'vaulted'; end if;
  if exists (select 1 from public.player_parts where player_id = uid and part_id = p_part) then
    raise exception 'already_owned';
  end if;
  select * into r from public.recipes where part_id = p_part;

  for v_tier, v_need in select key, value::integer from jsonb_each_text(r.components) loop
    select qty into have from public.player_components
      where player_id = uid and element = pt.element and rarity = v_tier for update;
    if coalesce(have, 0) < v_need then raise exception 'not_enough_components'; end if;
  end loop;
  update public.profiles set stardust = stardust - r.stardust, crowns = crowns - r.crowns
    where id = uid and stardust >= r.stardust and crowns >= r.crowns;
  if not found then raise exception 'not_enough_stardust'; end if;
  for v_tier, v_need in select key, value::integer from jsonb_each_text(r.components) loop
    perform private.add_component(uid, pt.element, v_tier, -v_need, 'forge', p_part);
  end loop;

  if pt.rarity = 'starforged' and pt.editions_forged < 100 then ed := pt.editions_forged + 1; end if;
  update public.parts set editions_forged = editions_forged + 1 where id = p_part;
  insert into public.player_parts (player_id, part_id, how, edition) values (uid, p_part, 'forge', ed);
  insert into private.ledger (player_id, reason, ref, stardust, crowns)
    values (uid, 'forge', p_part, -r.stardust, -r.crowns);
  return json_build_object('part', p_part, 'edition', ed);
end;
$$;

-- Refine: 5 of a tier → 1 of the next, same element, plus Stardust.
create function public.refine_components(p_element text, p_rarity text, p_times integer default 1)
returns json language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  tiers constant text[] := array['scrap', 'forged', 'tempered', 'runed', 'starforged'];
  costs constant integer[] := array[50, 150, 500, 1500];
  i integer := array_position(tiers, p_rarity);
  n integer := least(greatest(coalesce(p_times, 1), 1), 100);
  have integer;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if i is null or i = 5 or p_element not in ('fire', 'water', 'earth', 'air') then raise exception 'bad_request'; end if;
  select qty into have from public.player_components
    where player_id = uid and element = p_element and rarity = p_rarity for update;
  if coalesce(have, 0) < 5 * n then raise exception 'not_enough_components'; end if;
  update public.profiles set stardust = stardust - costs[i] * n where id = uid and stardust >= costs[i] * n;
  if not found then raise exception 'not_enough_stardust'; end if;
  perform private.add_component(uid, p_element, p_rarity, -5 * n, 'refine', null);
  perform private.add_component(uid, p_element, tiers[i + 1], n, 'refine', null);
  insert into private.ledger (player_id, reason, stardust) values (uid, 'refine', -costs[i] * n);
  return json_build_object('element', p_element, 'rarity', tiers[i + 1], 'made', n);
end;
$$;

-- Swap: 3 of an element → 1 of another, same tier, plus Stardust.
create function public.swap_components(p_from text, p_to text, p_rarity text, p_times integer default 1)
returns json language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  tiers constant text[] := array['scrap', 'forged', 'tempered', 'runed', 'starforged'];
  costs constant integer[] := array[20, 40, 80, 160, 320];
  i integer := array_position(tiers, p_rarity);
  n integer := least(greatest(coalesce(p_times, 1), 1), 100);
  have integer;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if i is null or p_from = p_to or p_from not in ('fire', 'water', 'earth', 'air')
     or p_to not in ('fire', 'water', 'earth', 'air') then raise exception 'bad_request'; end if;
  select qty into have from public.player_components
    where player_id = uid and element = p_from and rarity = p_rarity for update;
  if coalesce(have, 0) < 3 * n then raise exception 'not_enough_components'; end if;
  update public.profiles set stardust = stardust - costs[i] * n where id = uid and stardust >= costs[i] * n;
  if not found then raise exception 'not_enough_stardust'; end if;
  perform private.add_component(uid, p_from, p_rarity, -3 * n, 'swap', null);
  perform private.add_component(uid, p_to, p_rarity, n, 'swap', null);
  insert into private.ledger (player_id, reason, stardust) values (uid, 'swap', -costs[i] * n);
  return json_build_object('element', p_to, 'rarity', p_rarity, 'made', n);
end;
$$;

-- Put a part you own in its slot (null empties the slot).
create function public.equip_part(p_slot text, p_part text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_slot not in ('backdrop', 'sigil', 'frame', 'crest', 'aura') then raise exception 'bad_request'; end if;
  if p_part is not null and not exists (
    select 1 from public.player_parts pp join public.parts pt on pt.id = pp.part_id
    where pp.player_id = uid and pp.part_id = p_part and pt.slot = p_slot
  ) then raise exception 'not_owned'; end if;
  insert into public.avatar_loadouts (player_id) values (uid) on conflict do nothing;
  execute format('update public.avatar_loadouts set %I = $1 where player_id = $2', p_slot) using p_part, uid;
end;
$$;

-- ---------------------------------------------------------------- affinities
-- Choose (after 3 solved squares), or switch once per season in its first 7 days.
create function public.choose_affinity(p_affinity text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  p public.profiles;
  season smallint := private.current_season();
  crest text := 's0-crest-' || p_affinity;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_affinity not in ('fire', 'water', 'earth', 'air') then raise exception 'bad_request'; end if;
  select * into p from public.profiles where id = uid for update;
  if (select count(*) from public.games where user_id = uid and won) < 3 then raise exception 'too_soon'; end if;
  if p.affinity = p_affinity then return json_build_object('affinity', p_affinity); end if;
  if p.affinity is not null and (p.affinity_season = season
       or now() >= (select starts_at from public.seasons where id = season) + interval '7 days') then
    raise exception 'affinity_locked';
  end if;

  update public.profiles
    set affinity = p_affinity, affinity_season = case when p.affinity is null then null else season end
    where id = uid;
  -- the affinity's crest, free, and worn straight away
  insert into public.player_parts (player_id, part_id, how) values (uid, crest, 'starter') on conflict do nothing;
  insert into public.avatar_loadouts (player_id, crest) values (uid, crest)
    on conflict (player_id) do update set crest = excluded.crest;
  return json_build_object('affinity', p_affinity, 'crest', crest);
end;
$$;

-- This month's war: average influence per active member (§13.4).
create function public.affinity_standings() returns table (
  affinity text, members integer, influence bigint, standing numeric
) language sql stable security definer set search_path = '' as $$
  select e.affinity,
         coalesce(count(m.player_id) filter (where m.solves > 0), 0)::integer,
         coalesce(sum(m.influence), 0)::bigint,
         round(coalesce(sum(m.influence)::numeric / nullif(count(m.player_id) filter (where m.solves > 0), 0), 0), 2)
  from unnest(array['fire', 'water', 'earth', 'air']) as e (affinity)
  left join public.affinity_months m
    on m.affinity = e.affinity and m.month = date_trunc('month', now())::date
  group by e.affinity;
$$;

-- ---------------------------------------------------------------- grants
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.forge_part(text), public.refine_components(text, text, integer),
  public.swap_components(text, text, text, integer), public.equip_part(text, text),
  public.choose_affinity(text), public.affinity_standings() from public, anon;
grant execute on function public.forge_part(text), public.refine_components(text, text, integer),
  public.swap_components(text, text, text, integer), public.equip_part(text, text),
  public.choose_affinity(text), public.affinity_standings() to authenticated;
