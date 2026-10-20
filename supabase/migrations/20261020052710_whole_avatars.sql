-- Whole avatars (agreed with the owner, 2026-10-20). The layered avatar goes: every
-- avatar is one full picture, drawn whole.
--
-- * Two slots are left: the Avatar (the picture) and its Frame. Backdrop, Sigil and Aura
--   parts go, and the Crest stops being a part (the affinity shows on its own).
-- * Season 0's set: 11 avatars (5 Common, 3 Rare, 2 Epic, 1 Mythic) and the 12 frames.
--   Happy is everyone's avatar from the start (a free starter, worn when nothing else is).
-- * Polish brings an avatar to life, once: still → animated, for 6000 Stardust and a Spirit.
--   The old polish levels I–V go; their Stardust is paid back.
-- * The Rusted Crown becomes the Spirit, whose only use is polishing. It's rare: 0.15% on
--   each solve that counts toward parts (the first 9 a day), and one is guaranteed within
--   700 of them (about one every 7–8 weeks for a regular player). Crowns held carry over
--   one for one. Forging a Mythic no longer takes one.
-- * Parts that leave are paid back at their forge price (the free crests at nothing).

-- ---------------------------------------------------------------- Crowns → Spirits
alter table public.profiles rename column crowns to spirits;
alter table public.profiles rename column pity to spirit_pity;
alter table public.games rename column crown to spirit;
alter table private.ledger rename column crowns to spirits;

-- ---------------------------------------------------------------- polish: pay back I–V
with levels as (
  select player_id, sum(case polish when 1 then 200 when 2 then 600 when 3 then 1400 when 4 then 3000 when 5 then 6200 else 0 end)::integer as dust
  from public.player_parts where polish > 0 group by player_id
), paid as (
  update public.profiles p set stardust = p.stardust + l.dust from levels l where p.id = l.player_id
  returning p.id, l.dust
)
insert into private.ledger (player_id, reason, ref, stardust)
  select id, 'refund', 'polish levels', dust from paid;
update public.player_parts set polish = 0 where polish > 0;
alter table public.player_parts drop constraint player_parts_polish_check;
alter table public.player_parts add constraint player_parts_polish_check check (polish between 0 and 1);

-- ---------------------------------------------------------------- parts that leave
with leaving as (
  select pp.player_id, sum(case when pt.source = 'craft' then private.forge_cost(pt.rarity) else 0 end)::integer as dust
  from public.player_parts pp join public.parts pt on pt.id = pp.part_id
  where pt.slot in ('backdrop', 'sigil', 'crest', 'aura') group by pp.player_id
), paid as (
  update public.profiles p set stardust = p.stardust + l.dust from leaving l where p.id = l.player_id and l.dust > 0
  returning p.id, l.dust
)
insert into private.ledger (player_id, reason, ref, stardust)
  select id, 'refund', 'layered parts', dust from paid;

alter table public.avatar_loadouts
  drop column backdrop,
  drop column sigil,
  drop column crest,
  drop column aura,
  add column avatar text references public.parts (id);
delete from public.player_parts where part_id in (select id from public.parts where slot in ('backdrop', 'sigil', 'crest', 'aura'));
delete from public.drops where part_id in (select id from public.parts where slot in ('backdrop', 'sigil', 'crest', 'aura'));
delete from public.parts where slot in ('backdrop', 'sigil', 'crest', 'aura');

-- ---------------------------------------------------------------- the catalogue
alter table public.parts drop constraint parts_slot_check;
alter table public.parts add constraint parts_slot_check check (slot in ('avatar', 'frame'));
-- an avatar belongs to no element
alter table public.parts alter column element drop not null;

insert into public.parts (id, slot, element, rarity, season_id, source)
values ('s0-avatar-happy', 'avatar', null, 'common', 0, 'starter'),
       ('s0-avatar-bored', 'avatar', null, 'common', 0, 'craft'),
       ('s0-avatar-calm', 'avatar', null, 'common', 0, 'craft'),
       ('s0-avatar-upset', 'avatar', null, 'common', 0, 'craft'),
       ('s0-avatar-sad', 'avatar', null, 'common', 0, 'craft'),
       ('s0-avatar-disappointed', 'avatar', null, 'common', 0, 'craft'),
       ('s0-avatar-silly', 'avatar', null, 'rare', 0, 'craft'),
       ('s0-avatar-angry', 'avatar', null, 'rare', 0, 'craft'),
       ('s0-avatar-tired', 'avatar', null, 'rare', 0, 'craft'),
       ('s0-avatar-excited', 'avatar', null, 'epic', 0, 'craft'),
       ('s0-avatar-scared', 'avatar', null, 'epic', 0, 'craft'),
       ('s0-avatar-shocked', 'avatar', null, 'mythic', 0, 'craft');

-- Owns it: in the player's parts, or a starter avatar (Happy), which everyone has.
create function private.owns(p_player uuid, p_part text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.player_parts where player_id = p_player and part_id = p_part)
      or exists (select 1 from public.parts where id = p_part and source = 'starter' and slot = 'avatar');
$$;

-- ---------------------------------------------------------------- wearing
drop function public.equip_part(text, text);
create function public.equip_part(p_slot text, p_part text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_slot not in ('avatar', 'frame') then raise exception 'bad_request'; end if;
  if p_part is not null and (
    not exists (select 1 from public.parts where id = p_part and slot = p_slot) or not private.owns(uid, p_part)
  ) then raise exception 'not_owned'; end if;
  insert into public.avatar_loadouts (player_id) values (uid) on conflict do nothing;
  execute format('update public.avatar_loadouts set %I = $1 where player_id = $2', p_slot) using p_part, uid;
end;
$$;

-- ---------------------------------------------------------------- polish: bring it to life
drop function public.polish_part(text);
create function public.polish_part(p_part text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  lvl smallint;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.parts where id = p_part and slot = 'avatar') or not private.owns(uid, p_part) then
    raise exception 'not_owned';
  end if;
  -- a starter avatar gets its row the first time it's polished
  insert into public.player_parts (player_id, part_id, how) values (uid, p_part, 'starter') on conflict do nothing;
  select polish into lvl from public.player_parts where player_id = uid and part_id = p_part for update;
  if lvl >= 1 then raise exception 'already_alive'; end if;
  update public.profiles set stardust = stardust - 6000, spirits = spirits - 1
    where id = uid and stardust >= 6000 and spirits >= 1;
  if not found then raise exception 'not_enough_stardust'; end if;
  update public.player_parts set polish = 1 where player_id = uid and part_id = p_part;
  insert into private.ledger (player_id, reason, ref, stardust, spirits) values (uid, 'polish', p_part, -6000, -1);
  return json_build_object('part', p_part, 'polish', 1);
end;
$$;

-- ---------------------------------------------------------------- forging: no Crown for Mythic
create or replace function public.forge_part(p_part text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  pt public.parts;
  cost integer;
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
  update public.profiles set stardust = stardust - cost where id = uid and stardust >= cost;
  if not found then raise exception 'not_enough_stardust'; end if;
  -- first editions: the first 100 forges of a Mythic part are numbered
  if pt.rarity = 'mythic' and pt.editions_forged < 100 then ed := pt.editions_forged + 1; end if;
  update public.parts set editions_forged = editions_forged + 1 where id = p_part;
  insert into public.player_parts (player_id, part_id, how, edition) values (uid, p_part, 'forge', ed);
  insert into private.ledger (player_id, reason, ref, stardust) values (uid, 'forge', p_part, -cost);
  return json_build_object('part', p_part, 'edition', ed);
end;
$$;

-- ---------------------------------------------------------------- affinity: no crest
create or replace function public.choose_affinity(p_affinity text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  p public.profiles;
  season smallint := private.current_season();
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
  return json_build_object('affinity', p_affinity);
end;
$$;

-- ---------------------------------------------------------------- finish_game
-- As in stardust_sinks, with the Spirit in place of the Crown: rolled only on solves that
-- count toward parts.
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
  v_spirit boolean := false;
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

  -- Rated solves count toward the next part (first 9 a day: 3 parts), the Spirit (the same 9)
  -- and the affinity (first 25), UTC days.
  if p_won and unrated is null then
    select count(*) into solved_today from public.games
      where user_id = uid and won and finished_at >= date_trunc('day', now()) and id <> g.id;
    if solved_today < 9 then
      p.spirit_pity := p.spirit_pity + 1;
      if p.spirit_pity >= 700 or private.rand() < 0.0015 then
        v_spirit := true;
        p.spirits := p.spirits + 1;
        p.spirit_pity := 0;
      end if;
    end if;
  end if;

  update public.profiles
    set elo = p.elo, ranked_games = p.ranked_games, stardust = p.stardust, spirits = p.spirits, spirit_pity = p.spirit_pity
    where id = uid;
  update public.games
    set finished_at = now(), won = p_won, seconds = secs, mistakes = v_mistakes, hints = v_hints,
        rating = g.rating, elo_before = g.elo_before, elo_after = g.elo_after, stardust = dust, spirit = v_spirit,
        paused_at = null
    where id = g.id;
  if dust <> 0 or v_spirit then
    insert into private.ledger (player_id, reason, ref, stardust, spirits)
      values (uid, 'solve', g.id::text, dust, case when v_spirit then 1 else 0 end);
  end if;

  if p_won and unrated is null then
    if solved_today < 9 then
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
    -- solved days plus mended ones (mend_daily), each day once
    select count(*) into done from (
      select date_key from public.games
        where user_id = uid and mode = 'daily' and won and date_key >= month_start and date_key < (month_start + interval '1 month')::date
      union
      select date_key from public.daily_mends
        where player_id = uid and date_key >= month_start and date_key < (month_start + interval '1 month')::date
    ) d;
    daily_json := json_build_object('done', done, 'days', days, 'monthComplete', done = days);
  end if;

  return json_build_object('seconds', secs, 'dust', dust, 'spirit', v_spirit, 'elo', elo_json, 'daily', daily_json,
    'drop', drop_json, 'progress', progress_json,
    'influence', case when influence > 0 then json_build_object('affinity', p.affinity, 'amount', influence) end);
end;
$$;

-- ---------------------------------------------------------------- grants
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.equip_part(text, text), public.polish_part(text) from public, anon;
grant execute on function public.equip_part(text, text), public.polish_part(text) to authenticated;
