-- A mark on the result (owner 2026-10-22): when this game's win earned the worn frame a mark
-- (marks: every 40th rated win), finish_game says so: 'mark': {part, marks}. Otherwise as in
-- level_plates.
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
  -- the worn frame's wins before and after (marks), for a mark earned in this game
  mark_part text;
  wins_before integer;
  wins_after integer;
  mark_json json := null;
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
  select pp.part_id, pp.wins into mark_part, wins_before from public.avatar_loadouts l
    join public.player_parts pp on pp.player_id = l.player_id and pp.part_id = l.frame where l.player_id = uid;
  update public.games
    set finished_at = now(), won = p_won, seconds = secs, mistakes = v_mistakes, hints = v_hints,
        rating = g.rating, elo_before = g.elo_before, elo_after = g.elo_after, stardust = dust, spirit = v_spirit,
        paused_at = null, xp = v_xp
    where id = g.id;
  -- finishing the game counted the win on the worn frame (marks): a 40th win is a mark
  if mark_part is not null then
    select wins into wins_after from public.player_parts where player_id = uid and part_id = mark_part;
    if wins_after > wins_before and wins_after % 40 = 0 then
      mark_json := json_build_object('part', mark_part, 'marks', wins_after / 40);
    end if;
  end if;
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
    'xp', xp_json, 'mark', mark_json);
end;
$$;
