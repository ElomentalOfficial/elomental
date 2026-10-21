-- Account level (owner, 2026-10-21; designed with the game-economy-designer, ux-reviewer and
-- ui-designer): a permanent level from XP, never reset, and the one thing in the game that can
-- be ground without end.
--
-- * XP for every rated win, in any mode, with no daily cap: Easy 10, Medium 20, Hard 30 (Casual,
--   Clash and square codes by their difficulty), the Daily 30, Ranked 40. Losses, forfeits and
--   unrated wins earn none, and nothing is ever taken away.
-- * The level: from level L to L+1 costs 50 x L XP, with no top level (reaching level L takes
--   25 x L x (L - 1) XP). Each session moves the bar; a heavy player's lead grows slower over time.
-- * XP is status only: never spent (not a currency), never a Ranked edge, no Stardust per level.
--   The level shows on Home, the Profile and the player card, never on the leaderboard.
-- * profiles.xp holds the total, games.xp each game's share (so sum(games.xp) = profiles.xp);
--   no ledger row, as the ledger is for what can be spent.
-- * finish_game returns 'xp': {gained, total, level, into, need, levelUp} on a win.
-- * A pace guard, not a cap (backend-security-reviewer): no XP when another XP-paying win
--   finished within this game's minimum solve time, so a script can't finish games side by side
--   for XP. Dev mode earns none.
-- * Backfill: every past win under the same rule (flagged games and Ranked wins without a solve
--   audit earn none).

alter table public.profiles add column xp integer not null default 0 check (xp >= 0);
alter table public.games add column xp smallint not null default 0 check (xp >= 0);

-- ---------------------------------------------------------------- the rule and the curve
-- XP for a rated win of this game.
create function private.solve_xp(g public.games) returns integer
language sql immutable set search_path = '' as $$
  select case g.mode when 'daily' then 30 when 'ranked' then 40
    else case g.difficulty when 'easy' then 10 when 'medium' then 20 else 30 end end;
$$;

-- The level a total reaches, the XP into it, and what the next level needs.
create function private.xp_level(total integer, out level integer, out into_level integer, out need integer)
language plpgsql immutable set search_path = '' as $$
begin
  total := greatest(coalesce(total, 0), 0);
  level := greatest(1, floor((1 + sqrt(1 + 4 * total / 25.0)) / 2)::integer);
  -- (exact, whatever the float did)
  while 25 * (level + 1) * level <= total loop level := level + 1; end loop;
  while level > 1 and 25 * level * (level - 1) > total loop level := level - 1; end loop;
  into_level := total - 25 * level * (level - 1);
  need := 50 * level;
end;
$$;

-- ---------------------------------------------------------------- finish_game
-- As in finish_game_stages, with XP on a rated win.
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

  update public.profiles
    set elo = p.elo, ranked_games = p.ranked_games, stardust = p.stardust, spirits = p.spirits, spirit_pity = p.spirit_pity,
        dev_next_spirit = p.dev_next_spirit, xp = p.xp
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
        'levelUp', n.level > b.level)
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

-- ---------------------------------------------------------------- player_card
-- As in ranked_ladder, with the level.
create or replace function public.player_card(p_player uuid) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  p public.profiles;
  l public.avatar_loadouts;
  anon boolean;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  select * into p from public.profiles where id = p_player;
  select coalesce(is_anonymous, false) into anon from auth.users where id = p_player;
  if not found or p.id is null or (anon and p_player <> me) then return json_build_object('missing', true); end if;
  if (p.lb_hidden or not private.shown(p.test_account)) and p_player <> me then return json_build_object('hidden', true); end if;
  select * into l from public.avatar_loadouts where player_id = p_player;
  return json_build_object(
    'id', p.id, 'name', p.display_name, 'title', p.title, 'elo', p.elo, 'tier', p.rank_tier, 'plate', p.plate,
    'level', (private.xp_level(p.xp)).level,
    'avatar', l.avatar, 'frame', l.frame,
    'alive', coalesce((select polish = 1 from public.player_parts where player_id = p_player and part_id = coalesce(l.avatar, 's0-avatar-happy')), false),
    'peak', greatest(p.elo, coalesce((select max(elo_after) from public.games where user_id = p_player and elo_after is not null), 0)),
    'place', (select global_rank from private.lb where id = p_player),
    'position', (select global_pos from private.lb where id = p_player),
    'notRanked', private.ranked_restricted(p_player),
    'affinity', p.affinity, 'country', p.country,
    'stats', case when p.card_stats or p_player = me then json_build_object(
      'solved', (select count(*) from public.games where user_id = p_player and won),
      'ranked', p.ranked_games) end,
    'badges', coalesce((select json_agg(badge order by earned_at desc) from public.player_badges where player_id = p_player), '[]'::json),
    'showcase', coalesce(
      (select json_agg(b order by i) from unnest(p.showcase) with ordinality as s (b, i)
        where exists (select 1 from public.player_badges where player_id = p_player and badge = s.b)),
      (select json_agg(badge) from (select badge from public.player_badges where player_id = p_player order by earned_at desc limit 3) n),
      '[]'::json),
    'following', exists (select 1 from public.follows where follower = me and followee = p_player),
    'me', p_player = me);
end;
$$;

-- ---------------------------------------------------------------- backfill
-- every past win, as the rule pays now: not a flagged game, and a Ranked win only with its
-- solve audit (a Ranked win without one was unrated)
set local lock_timeout = '5s';
update public.games g set xp = private.solve_xp(g)
  where g.won and g.finished_at is not null
    and not exists (select 1 from private.review_flags f where f.game_id = g.id)
    and (g.mode <> 'ranked' or exists (select 1 from private.game_audits a where a.game_id = g.id));
update public.profiles p set xp = s.total
  from (select user_id, sum(xp)::integer as total from public.games group by user_id) s
  where s.user_id = p.id;

revoke execute on all functions in schema private from public, anon, authenticated;
