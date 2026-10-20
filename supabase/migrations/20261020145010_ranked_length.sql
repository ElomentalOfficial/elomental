-- Full review, batch B10, decision D5 (approved 2026-10-20: the full proposal, simulated in
-- docs/review/game-economy-designer.md's D5 note): a Ranked square takes about 10–15 minutes
-- at every level.
--
-- * The square follows your Elo up to 1200, then climbs a third as fast, up to 1800 at 3000
--   Elo, and no higher: the engine's hardest technique tops out around there, and above it a
--   higher rating only meant a longer square.
-- * Elo is priced as an even match against your own Elo, held to 150..3000 (elo_delta itself
--   is unchanged): below 1200 that's what it was; above 3000 gains fade, so Elo levels off.
--   A square easier than its target is discounted; a harder one earns nothing extra (C2).
--   Par goes by the target.
-- * Par is 10 to 15 minutes (the slow cut at 2× par: 20 to 30).
-- * Ranked influence goes by your Elo before the game, as the square's rating used to.
--
-- Data: none. Open Ranked games finish under the new rules. Undo: a later migration restoring
-- ranked_target (ranked_cap_4800), par_seconds (ranked_target_rating) and finish_game
-- (economy_pace), and dropping ranked_opponent.

create function private.ranked_opponent(elo integer) returns integer
language sql immutable set search_path = '' as $$
  select least(greatest(elo, 150), 3000);
$$;

create or replace function private.ranked_target(elo integer) returns integer
language sql immutable set search_path = '' as $$
  select case when e <= 1200 then e else 1200 + (e - 1200) / 3 end
  from (select private.ranked_opponent(elo) as e) as t;
$$;

create or replace function private.par_seconds(rating integer) returns integer
language sql immutable set search_path = '' as $$
  select least(greatest(240 + round(0.9 * rating)::integer, 600), 900);
$$;

-- ---------------------------------------------------------------- finish_game
-- As in economy_pace, priced on ranked_opponent (discounted for a too-easy square), par by the
-- target, Ranked influence by Elo.
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

  -- The square's rating (for the easy-square discount, and stored on the game): its target, or the audited puzzle's rating
  -- for a clean win; never the client's p_rating. Other modes keep the client's rating, clamped.
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
    -- an even match against your own Elo (held to 150..3000): squares level off above 1200 so they
    -- stay short, and Elo keeps its meaning. A square easier than its target (100 of slack for the
    -- generator's spread) is discounted by the difference; a harder one earns no premium, so a
    -- client can't gain by choosing its own puzzle (C2 wins, until B11 binds the givens).
    delta := case when unrated is null then private.elo_delta(p.elo,
               private.ranked_opponent(p.elo) + least(g.rating - target + 100, 0), p_won, p.ranked_games) else 0 end;
    if p_won and delta > 0 then
      -- pauses beyond 2 minutes can lose the bonus but never cause the slow cut
      -- par goes by the target the server chose, not the square's claimed rating
      bonus := greatest(private.speed_bonus(secs, target), least(private.speed_bonus(wall, target), 0));
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
          when 'ranked' then 3 + least(3, g.elo_before / 1000)
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

revoke execute on all functions in schema private from public, anon, authenticated;
