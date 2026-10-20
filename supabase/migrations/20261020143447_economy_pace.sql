-- Full review, batch B10 (docs/FULL_REVIEW.md DB-4; decisions D3, D7 defaults, approved 2026-10-20;
-- drafts in docs/review/game-economy-designer.md §4.3, §4.4 and ECO-4):
--
-- * M2  Spirits: 0.2% on each counted solve (was 0.15%), guaranteed within 500 (was 700).
--       The odds live in private.spirit_roll, so finish_game needn't change to tune them.
-- * H7, M6  Four Mythic frames (s0-frame-<element>-4) join Season Alpha's set, so the set
--       lasts about three weeks for a regular player and the Mythic guarantee lands on
--       something new more than once. A drop also says when you own every part of a rarity,
--       so the guarantee line can be honest about it.
-- * M3  Call a Spirit (D7): 15,000 Stardust, then 5,000 more for each one called this
--       season; only while an avatar you own still has no Spirit to wake it.
--
-- Data: four parts rows; two new profile columns (0 / null). Nobody's Stardust, Spirits or
-- parts change; spirit_pity carries over (anyone at 500+ gets a Spirit on their next counted
-- solve). Undo: a later migration restoring finish_game and drop_part from daily_month_badge
-- and dev_mode, dropping call_spirit and spirit_roll; the frames stay (players may own them).

-- ---------------------------------------------------------------- the Spirit's odds
create function private.spirit_roll(p_pity integer) returns boolean
language sql volatile set search_path = '' as $$
  select p_pity >= 500 or private.rand() < 0.002;
$$;

-- ---------------------------------------------------------------- four Mythic frames
insert into public.parts (id, slot, element, rarity, season_id, source)
select 's0-frame-' || e || '-4', 'frame', e, 'mythic', 0, 'craft'
from unnest(array['fire', 'water', 'earth', 'air']) as e
on conflict (id) do nothing;

-- ---------------------------------------------------------------- drops: say when a rarity is complete
-- As in dev_mode, and the answer also says whether you now own every part of each rarity.
create or replace function private.drop_part(p_player uuid, p_game uuid) returns json
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

  -- a part you don't have is much likelier than one you own, and your own element's favoured
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
    'guarantee', json_build_object('epic', 10 - p.pity_epic, 'mythic', 25 - p.pity_mythic),
    -- every part of that rarity owned: its next drop can only be Stardust
    'complete', (select json_object_agg(r, not exists (
        select 1 from public.parts pt
        where pt.rarity = r and pt.source = 'craft' and pt.season_id = private.current_season()
          and not exists (select 1 from public.player_parts pp where pp.player_id = p_player and pp.part_id = pt.id)))
      from unnest(array['epic', 'mythic']) as r));
end;
$$;

-- ---------------------------------------------------------------- finish_game
-- As in daily_month_badge, with the Spirit's odds from private.spirit_roll.
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
  raw integer;
  paused integer;
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
  solved_today integer := 0;
  capped boolean := false;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into g from public.games where id = p_game_id and user_id = uid for update;
  if not found then raise exception 'no_game'; end if;
  if g.finished_at is not null then raise exception 'already_finished'; end if;
  -- Ranked stored its target rating at start
  target := coalesce(g.target_rating, g.rating);

  -- Time. Paused time (each pause counting up to 5 minutes, the open one too) comes off the
  -- shown clock; for the speed bonus and the Clash result, at most 2 minutes of it does.
  raw := greatest(extract(epoch from now() - g.started_at)::integer, 0);
  paused := g.paused_seconds
    + case when g.paused_at is null then 0 else least(extract(epoch from now() - g.paused_at)::integer, 300) end;
  wall := greatest(raw - paused, 0);
  secs := case when g.mode in ('ranked', 'clash') then greatest(raw - least(paused, 120), 0)
               else least(greatest(coalesce(p_seconds, wall), 0), wall) end;

  if p_won then
    if not private.valid_solution(p_grid) then raise exception 'invalid_solution'; end if;
    -- Nobody fills a whole square this fast by hand (dev mode's instant solve aside).
    min_secs := case g.difficulty when 'easy' then 15 when 'medium' then 30 else 45 end;
    if wall < min_secs and not dev then raise exception 'too_fast'; end if;
  end if;

  -- A Ranked win needs a clean audit of this very grid (not in dev mode), and a player
  -- restricted from Ranked meanwhile gets no Elo for it.
  if g.mode = 'ranked' and p_won and not dev then
    if g.audit is null then unrated := 'unchecked';
    elsif coalesce((g.audit ->> 'copied')::boolean, true) or (g.audit ->> 'solution') is distinct from p_grid then unrated := 'copied';
    end if;
  end if;
  if g.mode = 'ranked' and p_won and unrated is null and private.ranked_restricted(uid) then
    unrated := 'restricted';
  end if;

  -- The rating: Ranked is priced on its target, or the audited puzzle's rating for a clean
  -- win; never on the client's p_rating. Other modes keep the client's rating, clamped.
  g.rating := case
    when g.mode = 'ranked' then
      case when p_won and unrated is null and (g.audit ->> 'rating') is not null
           then private.clamp_rating(g.difficulty, (g.audit ->> 'rating')::integer, target)
           else target end
    else private.clamp_rating(g.difficulty, coalesce(p_rating, g.rating), null) end;
  select * into p from public.profiles where id = uid for update;

  -- Rated solves today (UTC), flagged Ranked wins left out; dev mode counts none.
  if p_won then
    select count(*) into solved_today from public.games gg
      where gg.user_id = uid and gg.won and gg.finished_at >= date_trunc('day', now()) and gg.id <> g.id
        and not exists (select 1 from private.review_flags rf where rf.game_id = gg.id);
    if dev then solved_today := 0; end if;
  end if;

  if p_won then
    base := case g.mode when 'daily' then 12 when 'ranked' then 20
              else case g.difficulty when 'easy' then 4 when 'medium' then 8 else 15 end end;
    dust := case when unrated is null then greatest(1, base - v_mistakes * 2 - v_hints) else 1 end;
    -- Casual and Clash pay in full for the first 20 solves of the day
    if g.mode in ('casual', 'clash') and solved_today >= 20 then dust := least(dust, 1); end if;
    p.stardust := p.stardust + dust;
  end if;

  if g.mode = 'ranked' then
    g.elo_before := p.elo;
    delta := case when unrated is null then private.elo_delta(p.elo, g.rating, p_won, p.ranked_games) else 0 end;
    if p_won and delta > 0 then
      -- pauses beyond 2 minutes can lose the bonus but never cause the slow cut
      bonus := greatest(private.speed_bonus(secs, g.rating), least(private.speed_bonus(wall, g.rating), 0));
      -- Speed bonus first, then the hint cut, so hints can't be earned back by speed.
      hint_cut := least(1, v_hints * 0.25);
    end if;
    delta := round(delta * (1 + bonus) * (1 - hint_cut));
    p.elo := greatest(0, p.elo + delta);
    p.ranked_games := p.ranked_games + 1;
    g.elo_after := p.elo;
    elo_json := json_build_object('before', g.elo_before, 'after', g.elo_after,
      'protectedLoss', not p_won and delta = 0, 'bonus', bonus, 'hintCut', hint_cut, 'unrated', unrated);
    -- flags for review: copied and unchecked wins (at most 20 open per player)
    if unrated in ('copied', 'unchecked')
       and (select count(*) from private.review_flags where user_id = uid and not reviewed) < 20 then
      insert into private.review_flags (user_id, game_id, reason, audit) values (uid, g.id, unrated, g.audit);
    end if;
  end if;

  -- Rated solves count toward the next part and the Spirit (first 9 a day) and the affinity
  -- (first 25), UTC days.
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
  end if;

  update public.profiles
    set elo = p.elo, ranked_games = p.ranked_games, stardust = p.stardust, spirits = p.spirits, spirit_pity = p.spirit_pity,
        dev_next_spirit = p.dev_next_spirit
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

    -- influence: real players only
    if p.affinity is not null and solved_today < 25 and not p.test_account then
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

  -- the month so far, and its badge at 20 days (daily_month)
  if g.mode = 'daily' then
    daily_json := private.daily_month(uid, date_trunc('month', g.date_key)::date);
  end if;

  return json_build_object('seconds', secs, 'dust', dust, 'spirit', v_spirit, 'elo', elo_json, 'daily', daily_json,
    'drop', drop_json, 'progress', progress_json, 'partsCapped', capped,
    'dustCapped', p_won and g.mode in ('casual', 'clash') and solved_today >= 20,
    'influence', case when influence > 0 then json_build_object('affinity', p.affinity, 'amount', influence) end);
end;
$$;


-- ---------------------------------------------------------------- Call a Spirit (D7)
alter table public.profiles
  add column spirits_called smallint not null default 0,
  add column spirits_called_season smallint;

-- 15,000 Stardust, then 5,000 more for each one called this season; only while an avatar
-- you own (Happy counts) has no Spirit to wake it yet, counting the Spirits you hold.
create function public.call_spirit() returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  season smallint := private.current_season();
  p public.profiles;
  n integer;
  cost integer;
  avatars integer;
  alive integer;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into p from public.profiles where id = uid for update;
  select 1 + count(*) into avatars from public.player_parts pp join public.parts pt on pt.id = pp.part_id
    where pp.player_id = uid and pt.slot = 'avatar' and pt.source <> 'starter';
  select count(*) into alive from public.player_parts pp join public.parts pt on pt.id = pp.part_id
    where pp.player_id = uid and pt.slot = 'avatar' and pp.polish = 1;
  if alive + p.spirits >= avatars then raise exception 'no_avatar_to_wake'; end if;
  n := case when p.spirits_called_season = season then p.spirits_called else 0 end;
  cost := 15000 + 5000 * n;
  update public.profiles
    set stardust = stardust - cost, spirits = spirits + 1, spirits_called = n + 1, spirits_called_season = season
    where id = uid and stardust >= cost;
  if not found then raise exception 'not_enough_stardust'; end if;
  insert into private.ledger (player_id, reason, ref, stardust, spirits) values (uid, 'call_spirit', season::text, -cost, 1);
  return json_build_object('spirits', p.spirits + 1, 'cost', cost, 'next', cost + 5000);
end;
$$;
revoke execute on function public.call_spirit() from public, anon;
grant execute on function public.call_spirit() to authenticated;

-- ---------------------------------------------------------------- grants
revoke execute on all functions in schema private from public, anon, authenticated;