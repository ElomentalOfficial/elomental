-- finish_game in stages (full review R8, CQ-12). No change in behaviour: the same checks, sums
-- and writes, in the same order, as ranked_integrity's finish_game. Each stage is a private
-- function, so a later change replaces the stage it touches (15 lines), not the whole 200.
-- The stages run inside finish_game (security definer); private is closed to players.

-- The clock. Paused time (each pause counting up to 5 minutes, the open one too) comes off the
-- shown clock (wall); for the speed bonus and the Clash result, at most 2 minutes of it does (secs).
create or replace function private.finish_clock(g public.games, p_seconds integer, out wall integer, out secs integer)
language plpgsql set search_path = '' as $$
declare
  raw integer := greatest(extract(epoch from now() - g.started_at)::integer, 0);
  paused integer := g.paused_seconds
    + case when g.paused_at is null then 0 else least(extract(epoch from now() - g.paused_at)::integer, 300) end;
begin
  wall := greatest(raw - paused, 0);
  secs := case when g.mode in ('ranked', 'clash') then greatest(raw - least(paused, 120), 0)
               else least(greatest(coalesce(p_seconds, wall), 0), wall) end;
end;
$$;

-- Why a Ranked win isn't rated, or null: no clean audit of this very grid (not in dev mode), the
-- player restricted from Ranked meanwhile, or faster than a fifth of par on the server's clock (C3).
create or replace function private.ranked_unrated(g public.games, a jsonb, p_grid text, p_won boolean, dev boolean, wall integer, target integer)
returns text
language plpgsql set search_path = '' as $$
declare
  unrated text := null;
begin
  if g.mode <> 'ranked' or not p_won then return null; end if;
  if not dev then
    if a is null then unrated := 'unchecked';
    elsif coalesce((a ->> 'copied')::boolean, true) or (a ->> 'solution') is distinct from p_grid then unrated := 'copied';
    end if;
  end if;
  if unrated is null and private.ranked_restricted(g.user_id) then
    unrated := 'restricted';
  end if;
  -- a bot can fake its move times, not the server's clock
  if unrated is null and not dev and wall < private.par_seconds(target) / 5 then
    unrated := 'too_quick';
  end if;
  return unrated;
end;
$$;

-- The square's rating (for the easy-square discount, and stored on the game): Ranked's target, or
-- the audited puzzle's rating for a clean win; never the client's p_rating. Other modes keep the
-- client's rating, clamped.
create or replace function private.square_rating(g public.games, a jsonb, p_won boolean, unrated text, p_rating integer, target integer)
returns integer
language sql set search_path = '' as $$
  select case
    when g.mode = 'ranked' then
      case when p_won and unrated is null and (a ->> 'rating') is not null
           then private.clamp_rating(g.difficulty, (a ->> 'rating')::integer, target)
           else target end
    else private.clamp_rating(g.difficulty, coalesce(p_rating, g.rating), null) end;
$$;

-- Rated solves today (UTC) before this game, flagged Ranked wins left out. (p_ names: in a SQL
-- function a column of the same name would win over the parameter.)
create or replace function private.rated_solves_today(p_uid uuid, p_game_id uuid)
returns integer
language sql set search_path = '' as $$
  select count(*)::integer from public.games gg
    where gg.user_id = p_uid and gg.won and gg.finished_at >= date_trunc('day', now()) and gg.id <> p_game_id
      and not exists (select 1 from private.review_flags rf where rf.game_id = gg.id);
$$;

-- Stardust for a win. Casual and Clash pay in full for the first 20 solves of the day.
create or replace function private.solve_dust(g public.games, unrated text, v_mistakes integer, v_hints integer, solved_today integer)
returns integer
language plpgsql set search_path = '' as $$
declare
  base integer := case g.mode when 'daily' then 12 when 'ranked' then 20
                    else case g.difficulty when 'easy' then 4 when 'medium' then 8 else 15 end end;
  dust integer := case when unrated is null then greatest(1, base - v_mistakes * 2 - v_hints) else 1 end;
begin
  if g.mode in ('casual', 'clash') and solved_today >= 20 then dust := least(dust, 1); end if;
  return dust;
end;
$$;

-- Ranked's Elo change from `elo` (the player's rating before), and what the result shows of it.
-- An even match against your own Elo (held to 150..3000): squares level off above 1200 so they
-- stay short, and Elo keeps its meaning. A square easier than its target (100 of slack for the
-- generator's spread) is discounted by the difference; a harder one earns no premium. Copied,
-- unchecked and too-quick wins are flagged for review (at most 20 open per player).
create or replace function private.ranked_elo(uid uuid, g public.games, a jsonb, elo integer, ranked_games integer, p_won boolean,
  unrated text, target integer, secs integer, wall integer, v_hints integer, out elo_after integer, out elo_json json)
language plpgsql set search_path = '' as $$
declare
  delta integer;
  bonus numeric := 0;
  hint_cut numeric := 0;
begin
  delta := case when unrated is null then private.elo_delta(elo,
             private.ranked_opponent(elo) + least(g.rating - target + 100, 0), p_won, ranked_games) else 0 end;
  if p_won and delta > 0 then
    -- pauses beyond 2 minutes can lose the bonus but never cause the slow cut;
    -- par goes by the target the server chose, not the square's claimed rating
    bonus := greatest(private.speed_bonus(secs, target), least(private.speed_bonus(wall, target), 0));
    -- Speed bonus first, then the hint cut, so hints can't be earned back by speed.
    hint_cut := least(1, v_hints * 0.25);
  end if;
  delta := round(delta * (1 + bonus) * (1 - hint_cut));
  elo_after := greatest(0, elo + delta);
  elo_json := json_build_object('before', elo, 'after', elo_after,
    'protectedLoss', not p_won and delta = 0, 'bonus', bonus, 'hintCut', hint_cut, 'unrated', unrated);
  if unrated in ('copied', 'unchecked', 'too_quick')
     and (select count(*) from private.review_flags where user_id = uid and not reviewed) < 20 then
    insert into private.review_flags (user_id, game_id, reason, audit) values (uid, g.id, unrated, a);
  end if;
end;
$$;

-- A rated win's share in the next part (every 3rd of the first 9 a day) and in the affinity's
-- month (the first 25 a day; real players only).
create or replace function private.count_solve(uid uuid, g public.games, p public.profiles, solved_today integer,
  v_mistakes integer, v_hints integer, out drop_json json, out progress_json json, out influence integer)
language plpgsql set search_path = '' as $$
declare
  progress integer;
begin
  influence := 0;
  if solved_today < 9 then
    update public.profiles set part_progress = (part_progress + 1) % 3 where id = uid
      returning part_progress into progress;
    if progress = 0 then drop_json := private.drop_part(uid, g.id); end if;
    progress_json := json_build_object('count', progress, 'every', 3);
  end if;
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
    select c.drop_json, c.progress_json, c.influence into drop_json, progress_json, influence
      from private.count_solve(uid, g, p, solved_today, v_mistakes, v_hints) c;
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
