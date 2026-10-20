-- Full review, batch B1 (docs/FULL_REVIEW.md, approved 2026-10-20): security and economy
-- integrity. Items: C1 (interim), C2 (losses), C4, H1, H2, M4, M16, L1, L3, L4, L5, L6, L8,
-- L10, L11, L16.
--
-- * C2  A Ranked game is priced on the target set at start: a loss always, a win unless the
--       solve audit graded the puzzle (the client's p_rating is never used in Ranked).
-- * C1  One open Casual game per player and at most 3 open Clash games (a new one closes the
--       oldest as abandoned); Casual and Clash solves past the first 20 of a UTC day pay 1
--       Stardust. (The full fix, the server knowing each puzzle, is batch B11.)
-- * C4  In Ranked and Clash, at most 2 minutes of pauses come off the time that counts (the
--       speed bonus and the Clash result); pausing never costs the slow cut. The 3 pauses and
--       their 5-minute limit stay.
-- * H1  Each founder is pinned to one verified authenticator (private.founders.factor_id), and
--       founder powers need a session that passed that very authenticator's code: a factor
--       enrolled later grants nothing until the owner pins it by hand.
-- * H2  An account that ever switches dev mode on becomes a test account, for good: off the
--       leaderboard, search and cards, no influence, not paid at settlement, no numbered
--       editions; dev tools write ledger rows.
-- * M4  The month's standing counts each member's influence up to 300; a member counts and
--       is paid from 5 solves; tied sides all win.
-- * M16 finish_game says when the day's 9 counted solves are used up (partsCapped).
-- * L1  Lists and search leave out hidden, restricted and test accounts at once, not at the
--       next snapshot.  L3 the Founder title needs a confirmed email.  L4 grants and a
--       non-negative balance check.  L5 a player banned mid-game gets no Elo for it.
--       L6 opening ledger rows.  L8 flagged Ranked wins don't use up the counted solves.
--       L10 a filled-in Daily can't also be played (and filling one in closes its open game).
--       L11 buy_plate names the plate.  L16 no duplicate badges in the showcase; country
--       from the list the app offers.  The old public.leaderboard() call goes (it listed
--       hidden players; the app uses lb_page).  Ranked games keep their target rating.
--
-- Existing players' data: stale open Casual games (all but the newest) and Clash games (all
-- but the newest 3) are closed as abandoned (no payout, no Elo); test accounts lose their
-- numbered editions and this month's influence; accounts whose balance and ledger disagree
-- get one opening ledger row. No balance, Elo or part changes for anyone.
--
-- Undo: there is no down migration; a later migration would restore the previous function
-- bodies (from dev_mode, founder_mfa, leaderboard, stardust_sinks, ranked_restrictions).

-- Don't queue sign-ins and games behind this migration: fail fast and retry instead.
set local lock_timeout = '5s';

-- ---------------------------------------------------------------- H1: founders pinned to a factor
alter table private.founders add column factor_id uuid;
-- pin each founder's earliest verified authenticator; a founder without one has no access
update private.founders f set factor_id = (
  select m.id from auth.users u join auth.mfa_factors m on m.user_id = u.id
  where lower(u.email) = lower(f.email) and m.status = 'verified'
  order by m.created_at limit 1);

create or replace function private.is_admin(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from auth.users u
       join private.founders f on lower(f.email) = lower(u.email)
       join auth.mfa_factors m on m.id = f.factor_id and m.user_id = u.id and m.status = 'verified'
       -- this session reached aal2 with the pinned authenticator, not another one
       join auth.sessions s on s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid and s.user_id = u.id
         and s.factor_id = f.factor_id and s.aal::text = 'aal2'
       where u.id = p_user and u.email_confirmed_at is not null);
$$;

-- For the SQL Editor, after a founder sets up (or replaces) their authenticator. First look
-- at their factors and pick the one they just made on their own phone:
--   select m.id, m.friendly_name, m.created_at from auth.mfa_factors m join auth.users u on u.id = m.user_id
--     where u.email = 'founder@example.com' and m.status = 'verified';
--   select private.pin_founder_factor('founder@example.com', '<that id>');
create function private.pin_founder_factor(p_email text, p_factor uuid) returns text
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from auth.users u join auth.mfa_factors m on m.user_id = u.id
                 where lower(u.email) = lower(p_email) and m.id = p_factor and m.status = 'verified') then
    raise exception 'That authenticator isn''t a verified one of that founder''s';
  end if;
  update private.founders set factor_id = p_factor where lower(email) = lower(p_email);
  if not found then raise exception 'Not a founder email'; end if;
  return 'Pinned.';
end;
$$;

-- ---------------------------------------------------------------- L3: the title needs a confirmed email
create or replace function private.apply_founder_title() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null and new.email_confirmed_at is not null
     and exists (select 1 from private.founders f where lower(f.email) = lower(new.email)) then
    update public.profiles set title = 'Founder' where id = new.id;
  end if;
  return new;
end;
$$;
-- (the trigger that also fires on confirming is added at the very end: auth.users isn't ours
-- to drop triggers on, and adding one locks it, so as briefly as possible)
update public.profiles p set title = null
  where p.title = 'Founder' and not exists (
    select 1 from auth.users u join private.founders f on lower(f.email) = lower(u.email)
    where u.id = p.id and u.email_confirmed_at is not null);

-- ---------------------------------------------------------------- H2: test accounts
alter table public.profiles add column test_account boolean not null default false;
update public.profiles p set test_account = true
  where p.dev_mode or exists (select 1 from private.founder_log l where l.founder_id = p.id and l.action = 'dev_on');

-- their numbered editions go back (the counter keeps every number still held)
update public.player_parts pp set edition = null
  from public.profiles p where p.id = pp.player_id and p.test_account and pp.edition is not null;
update public.parts pt set editions_forged = greatest(
    coalesce((select max(edition) from public.player_parts where part_id = pt.id), 0),
    (select count(*) from public.player_parts pp join public.profiles p on p.id = pp.player_id
      where pp.part_id = pt.id and pp.how = 'forge' and not p.test_account))
  where exists (select 1 from public.player_parts pp join public.profiles p on p.id = pp.player_id
                where pp.part_id = pt.id and p.test_account);
-- and this month's influence (the war is for real players)
delete from public.affinity_months a using public.profiles p
  where p.id = a.player_id and p.test_account and a.month = date_trunc('month', now())::date;

create or replace function public.dev_set_mode(p_on boolean) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not private.is_admin(uid) then raise exception 'not_admin'; end if;
  update public.profiles
    set dev_mode = coalesce(p_on, false),
        -- once on, the account is a test account for good
        test_account = test_account or coalesce(p_on, false),
        dev_next_drop = case when coalesce(p_on, false) then dev_next_drop end,
        dev_next_spirit = coalesce(p_on, false) and dev_next_spirit
    where id = uid;
  insert into private.founder_log (founder_id, action) values (uid, case when coalesce(p_on, false) then 'dev_on' else 'dev_off' end);
  return json_build_object('devMode', coalesce(p_on, false));
end;
$$;

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
      if n not between 0 and 4 then raise exception 'bad_request'; end if;
      update public.profiles set plate = n where id = uid;
    when 'elo' then
      n := p_value::integer;
      if n not between 0 and 4800 then raise exception 'bad_request'; end if;
      update public.profiles set elo = n where id = uid;
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

-- no numbered edition for a test account
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
  -- first editions: the first 100 forges of a Mythic part are numbered (test accounts don't
  -- count and get no number)
  if not (select test_account from public.profiles where id = uid) then
    if pt.rarity = 'mythic' and pt.editions_forged < 100 then ed := pt.editions_forged + 1; end if;
    update public.parts set editions_forged = editions_forged + 1 where id = p_part;
  end if;
  insert into public.player_parts (player_id, part_id, how, edition) values (uid, p_part, 'forge', ed);
  insert into private.ledger (player_id, reason, ref, stardust) values (uid, 'forge', p_part, -cost);
  return json_build_object('part', p_part, 'edition', ed);
end;
$$;

-- ---------------------------------------------------------------- C1 interim: open Casual and Clash games
-- stale open games close as abandoned (no payout, no Elo): the newest Casual one and the
-- newest 3 Clash ones stay
update public.games g set finished_at = now(), won = false, seconds = 0
  from (select id, row_number() over (partition by user_id, mode order by started_at desc) as n
        from public.games where mode in ('casual', 'clash') and finished_at is null) o
  where g.id = o.id and o.n > case g.mode when 'casual' then 1 else 3 end;
create unique index games_one_open_casual on public.games (user_id) where mode = 'casual' and finished_at is null;

-- C2: the Ranked target is kept on the game (rating may become the audited puzzle's)
alter table public.games add column target_rating integer;
update public.games set target_rating = rating where mode = 'ranked' and finished_at is null;

create or replace function public.start_game(p_mode text, p_difficulty text default null, p_date_key date default null, p_clash_code text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g public.games;
  diff text;
  target integer;
  today date := (now() at time zone 'utc')::date;
begin
  if uid is null then raise exception 'not_signed_in'; end if;

  if p_mode = 'ranked' then
    if private.ranked_restricted(uid) then raise exception 'ranked_restricted'; end if;
    perform public.finish_game(id, false, 0, 0, null, null, null)
      from public.games where user_id = uid and mode = 'ranked' and finished_at is null;
    select private.ranked_target(elo) into target from public.profiles where id = uid;
    diff := private.rating_difficulty(target);
    insert into public.games (user_id, mode, difficulty, seed, rating, target_rating)
      values (uid, 'ranked', diff, 'ranked:' || replace(gen_random_uuid()::text, '-', ''), target, target)
      returning * into g;
    return json_build_object('game_id', g.id, 'seed', g.seed, 'difficulty', g.difficulty,
      'target_rating', target, 'resumed', false);

  elsif p_mode = 'casual' then
    if p_difficulty is null or p_difficulty not in ('easy', 'medium', 'hard') then raise exception 'bad_difficulty'; end if;
    -- one open Casual game: a new one closes the old as abandoned (one start at a time per
    -- player, so a double tap can't trip the one-open index)
    perform 1 from public.profiles where id = uid for update;
    update public.games set finished_at = now(), won = false, seconds = 0
      where user_id = uid and mode = 'casual' and finished_at is null;
    insert into public.games (user_id, mode, difficulty, seed, rating)
      values (uid, 'casual', p_difficulty, 'casual:' || replace(gen_random_uuid()::text, '-', ''), private.clamp_rating(p_difficulty, null))
      returning * into g;

  elsif p_mode = 'daily' then
    if p_date_key is null or p_date_key not between today - 1 and today + 1 then raise exception 'bad_date'; end if;
    if exists (select 1 from public.games where user_id = uid and mode = 'daily' and date_key = p_date_key and won)
       -- a day filled in with Stardust is done too
       or exists (select 1 from public.daily_mends where player_id = uid and date_key = p_date_key) then
      raise exception 'daily_done';
    end if;
    select * into g from public.games
      where user_id = uid and mode = 'daily' and date_key = p_date_key and finished_at is null;
    if found then
      return json_build_object('game_id', g.id, 'seed', g.seed, 'difficulty', g.difficulty, 'resumed', true);
    end if;
    insert into public.games (user_id, mode, difficulty, seed, date_key, rating)
      values (uid, 'daily', 'medium', 'daily:' || to_char(p_date_key, 'YYYY-MM-DD'), p_date_key, private.clamp_rating('medium', null))
      returning * into g;

  elsif p_mode = 'clash' then
    if p_clash_code is null or p_clash_code !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$' then raise exception 'bad_code'; end if;
    perform 1 from public.profiles where id = uid for update;
    diff := private.code_difficulty(p_clash_code);
    insert into public.clashes (code, difficulty, created_by) values (p_clash_code, diff, uid)
      on conflict (code) do nothing;
    select * into g from public.games where user_id = uid and mode = 'clash' and clash_code = p_clash_code;
    if found then
      if g.finished_at is not null then raise exception 'clash_played'; end if;
      return json_build_object('game_id', g.id, 'seed', g.seed, 'difficulty', g.difficulty, 'resumed', true);
    end if;
    -- at most 3 open Clash games: a 4th closes the oldest as abandoned
    update public.games set finished_at = now(), won = false, seconds = 0
      where id in (select id from public.games where user_id = uid and mode = 'clash' and finished_at is null
                   order by started_at desc offset 2);
    insert into public.games (user_id, mode, difficulty, seed, clash_code, rating)
      values (uid, 'clash', diff, 'clash:' || p_clash_code, p_clash_code, private.clamp_rating(diff, null))
      returning * into g;

  else
    raise exception 'bad_mode';
  end if;

  return json_build_object('game_id', g.id, 'seed', g.seed, 'difficulty', g.difficulty, 'resumed', false);
end;
$$;

-- ---------------------------------------------------------------- finish_game
-- As in dev_mode, plus C2, C1 (Stardust cap), C4, H2 (no influence for test accounts), M16,
-- L5 and L8.
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
  month_start date;
  days integer;
  done integer;
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
      if p.spirit_pity >= 700 or private.rand() < 0.0015 or (dev and p.dev_next_spirit) then
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
    'drop', drop_json, 'progress', progress_json, 'partsCapped', capped,
    'dustCapped', p_won and g.mode in ('casual', 'clash') and solved_today >= 20,
    'influence', case when influence > 0 then json_build_object('affinity', p.affinity, 'amount', influence) end);
end;
$$;

-- ---------------------------------------------------------------- the leaderboard without test accounts
-- (recreated: the snapshot leaves test accounts out; lb_row depends on its row type)
drop materialized view private.lb cascade;
create materialized view private.lb as
with season as (
  select coalesce((select starts_at from public.seasons where id = private.current_season()), now()) as starts_at
), players as (
  select p.id, p.display_name, p.elo, p.ranked_games, p.title, p.plate, p.affinity, p.country,
         l.avatar, l.frame,
         coalesce((select pp.polish = 1 from public.player_parts pp where pp.player_id = p.id and pp.part_id = l.avatar), false) as alive,
         p.elo - coalesce((
           select g.elo_before from public.games g
           where g.user_id = p.id and g.mode = 'ranked' and g.finished_at >= (select starts_at from season) and g.elo_before is not null
           order by g.finished_at limit 1), p.elo) as season_gain
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.avatar_loadouts l on l.player_id = p.id
  where p.ranked_games > 0 and not coalesce(u.is_anonymous, false) and not p.lb_hidden and not p.test_account
    and not private.ranked_restricted(p.id)
)
select *,
  rank() over (order by elo desc) as global_rank,
  case when affinity is not null then rank() over (partition by affinity order by elo desc) end as faction_rank,
  case when country is not null then rank() over (partition by country order by elo desc) end as country_rank,
  case when season_gain > 0 then rank() over (order by season_gain desc) end as season_rank
from players;
create unique index lb_id on private.lb (id);
create index lb_global on private.lb (global_rank);
create index lb_faction on private.lb (affinity, faction_rank);
create index lb_country on private.lb (country, country_rank);
create index lb_season on private.lb (season_rank);
revoke all on private.lb from public, anon, authenticated;

create function private.lb_row(r private.lb, place bigint, value integer, me uuid) returns json
language sql stable set search_path = '' as $$
  select json_build_object('place', place, 'id', r.id, 'name', r.display_name, 'title', r.title, 'elo', r.elo,
    'value', value, 'plate', r.plate, 'avatar', r.avatar, 'frame', r.frame, 'alive', r.alive,
    'affinity', r.affinity, 'country', r.country, 'me', r.id = me);
$$;

-- unchanged, recreated so open connections don't keep the old snapshot's row type
create or replace function private.lb_place(p_view text, p_scope text, me uuid) returns bigint
language plpgsql stable set search_path = '' as $$
declare
  r private.lb;
  p public.profiles;
  gain integer;
begin
  select * into r from private.lb where id = me;
  select * into p from public.profiles where id = me;
  if p_view = 'global' then
    return coalesce(r.global_rank, case when p.ranked_games > 0 then 1 + (select count(*) from private.lb where elo > p.elo) end);
  elsif p_view = 'faction' then
    if p.affinity is distinct from p_scope then return null; end if;
    return coalesce(r.faction_rank, case when p.ranked_games > 0 then 1 + (select count(*) from private.lb where affinity = p_scope and elo > p.elo) end);
  elsif p_view = 'country' then
    if p.country is distinct from p_scope then return null; end if;
    return coalesce(r.country_rank, case when p.ranked_games > 0 then 1 + (select count(*) from private.lb where country = p_scope and elo > p.elo) end);
  elsif p_view = 'season' then
    if r.id is not null then return r.season_rank; end if;
    return null;
  elsif p_view = 'friends' then
    if p.ranked_games = 0 then return null; end if;
    return 1 + (select count(*) from private.lb l
                where l.id in (select followee from public.follows where follower = me) and l.elo > p.elo);
  end if;
  return null;
end;
$$;

-- the first leaderboard call, unused since lb_page: it listed hidden players and test accounts
drop function public.leaderboard(integer);

-- L1: still listable right now (the snapshot can be up to 5 minutes old)
create function private.lb_visible(p_player uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p_player and not lb_hidden and not test_account)
     and not private.ranked_restricted(p_player);
$$;

create or replace function private.lb_range(p_view text, p_scope text, p_from bigint, p_to bigint, me uuid) returns json
language plpgsql stable set search_path = '' as $$
declare
  out json;
begin
  if p_view = 'global' then
    select json_agg(private.lb_row(r, r.global_rank, r.elo, me) order by r.global_rank, r.display_name) into out
      from private.lb r where r.global_rank between p_from and p_to and private.lb_visible(r.id);
  elsif p_view = 'season' then
    select json_agg(private.lb_row(r, r.season_rank, r.season_gain, me) order by r.season_rank, r.display_name) into out
      from private.lb r where r.season_rank between p_from and p_to and private.lb_visible(r.id);
  elsif p_view = 'faction' then
    select json_agg(private.lb_row(r, r.faction_rank, r.elo, me) order by r.faction_rank, r.display_name) into out
      from private.lb r where r.affinity = p_scope and r.faction_rank between p_from and p_to and private.lb_visible(r.id);
  elsif p_view = 'country' then
    select json_agg(private.lb_row(r, r.country_rank, r.elo, me) order by r.country_rank, r.display_name) into out
      from private.lb r where r.country = p_scope and r.country_rank between p_from and p_to and private.lb_visible(r.id);
  elsif p_view = 'friends' then
    -- who you follow, and you: small (at most 501), ranked on the spot
    select json_agg(private.lb_row(f.r, f.place, (f.r).elo, me) order by f.place, (f.r).display_name) into out
      from (select r, rank() over (order by r.elo desc) as place from private.lb r
            where (r.id = me or r.id in (select followee from public.follows where follower = me)) and private.lb_visible(r.id)) f
      where f.place between p_from and p_to;
  else
    raise exception 'bad_request';
  end if;
  return coalesce(out, '[]'::json);
end;
$$;
select private.refresh_lb();

-- search: no test accounts; restricted players show without a place
create or replace function public.lb_search(p_query text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  q text := lower(trim(coalesce(p_query, '')));
  pat text;
  hits integer;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if length(q) < 2 then return '[]'::json; end if;
  insert into private.search_hits (player_id, minute, n) values (me, date_trunc('minute', now()), 1)
    on conflict (player_id, minute) do update set n = private.search_hits.n + 1
    returning n into hits;
  if hits > 30 then raise exception 'slow_down'; end if;
  delete from private.search_hits where minute < now() - interval '10 minutes';
  pat := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((
    select json_agg(row_to_json(x) order by x.prefix desc, x.score desc, x.elo desc)
    from (
      select p.id, p.display_name as name, p.elo, p.title, p.plate, l.avatar, l.frame,
             case when private.ranked_restricted(p.id) then null else r.global_rank end as place,
             lower(p.display_name) like pat as prefix,
             extensions.similarity(lower(p.display_name), q) as score
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.avatar_loadouts l on l.player_id = p.id
      left join private.lb r on r.id = p.id
      where not coalesce(u.is_anonymous, false) and not p.lb_hidden and not p.test_account
        and (lower(p.display_name) like pat or lower(p.display_name) operator(extensions.%) q)
      order by lower(p.display_name) like pat desc, extensions.similarity(lower(p.display_name), q) desc
      limit 20
    ) x
  ), '[]'::json);
end;
$$;

-- cards: a test account is private to everyone else
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
  if (p.lb_hidden or p.test_account) and p_player <> me then return json_build_object('hidden', true); end if;
  select * into l from public.avatar_loadouts where player_id = p_player;
  return json_build_object(
    'id', p.id, 'name', p.display_name, 'title', p.title, 'elo', p.elo, 'plate', p.plate,
    'avatar', l.avatar, 'frame', l.frame,
    'alive', coalesce((select polish = 1 from public.player_parts where player_id = p_player and part_id = coalesce(l.avatar, 's0-avatar-happy')), false),
    'peak', greatest(p.elo, coalesce((select max(elo_after) from public.games where user_id = p_player and elo_after is not null), 0)),
    'place', (select global_rank from private.lb where id = p_player),
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

create or replace function public.follow(p_player uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if p_player = me then raise exception 'bad_request'; end if;
  if not exists (select 1 from public.profiles p join auth.users u on u.id = p.id
                 where p.id = p_player and not coalesce(u.is_anonymous, false) and not p.lb_hidden and not p.test_account) then
    raise exception 'no_player';
  end if;
  if (select count(*) from public.follows where follower = me) >= 500 then raise exception 'too_many_follows'; end if;
  insert into public.follows (follower, followee) values (me, p_player) on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------- M4: the monthly war
-- A member counts (and is paid) from 5 solves in the month; each member's influence counts up
-- to 300 toward their side's standing; test accounts never count.
create or replace function private.standings(p_month date) returns table (affinity text, members integer, influence bigint, standing numeric)
language sql stable set search_path = '' as $$
  select e.affinity,
         coalesce(count(m.player_id), 0)::integer,
         -- the influence that counts, so "players · influence · each" adds up
         coalesce(sum(least(m.influence, 300)), 0)::bigint,
         round(coalesce(sum(least(m.influence, 300))::numeric / nullif(count(m.player_id), 0), 0), 2)
  from unnest(array['fire', 'water', 'earth', 'air']) as e (affinity)
  left join (
    select a.* from public.affinity_months a join public.profiles p on p.id = a.player_id
    where a.month = p_month and a.solves >= 5 and not p.test_account
  ) m on m.affinity = e.affinity
  group by e.affinity;
$$;

-- the older call the Forge and the affinity page use: the same numbers
create or replace function public.affinity_standings() returns table (
  affinity text, members integer, influence bigint, standing numeric
) language sql stable security definer set search_path = '' as $$
  select * from private.standings(date_trunc('month', now())::date);
$$;

alter table public.faction_months add column winners text[];

-- Every side with the top standing wins (a tie pays both); winners' members with 5+ solves
-- get the dated badge and 300 Stardust.
create or replace function private.settle_faction_month(p_month date) returns text
language plpgsql security definer set search_path = '' as $$
declare
  wins text[];
  w text;
begin
  if exists (select 1 from public.faction_months where month = p_month) then
    return (select winner from public.faction_months where month = p_month);
  end if;
  select array_agg(s.affinity order by s.affinity) into wins from private.standings(p_month) s
    where s.members > 0 and s.standing = (select max(x.standing) from private.standings(p_month) x where x.members > 0);
  insert into public.faction_months (month, winner, winners) values (p_month, wins[1], wins);
  if wins is null then return null; end if;
  foreach w in array wins loop
    insert into public.badges (id, source) values ('win-' || to_char(p_month, 'YYYY-MM') || '-' || w, 'earned') on conflict do nothing;
    with helped as (
      select a.player_id from public.affinity_months a join public.profiles p on p.id = a.player_id
      where a.month = p_month and a.affinity = w and a.influence > 0 and a.solves >= 5 and not p.test_account
    ), badged as (
      insert into public.player_badges (player_id, badge)
        select player_id, 'win-' || to_char(p_month, 'YYYY-MM') || '-' || w from helped
        on conflict do nothing
        returning player_id
    ), paid as (
      update public.profiles p set stardust = p.stardust + 300 from badged b where p.id = b.player_id returning p.id
    )
    insert into private.ledger (player_id, reason, ref, stardust)
      select id, 'faction_win', to_char(p_month, 'YYYY-MM') || '-' || w, 300 from paid;
  end loop;
  return wins[1];
end;
$$;

create or replace function public.faction_board() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_month date := date_trunc('month', now())::date;
  mine text;
  my_influence integer;
  my_solves integer;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  select affinity into mine from public.profiles where id = me;
  select influence, solves into my_influence, my_solves from public.affinity_months where month = v_month and player_id = me and affinity = mine;
  return json_build_object(
    'month', v_month,
    'endsAt', (v_month + interval '1 month'),
    'standings', (select json_agg(row_to_json(s) order by s.standing desc, s.influence desc) from private.standings(v_month) s),
    'mine', mine,
    'myInfluence', coalesce(my_influence, 0),
    'mySolves', coalesce(my_solves, 0),
    'myPlace', case when my_influence > 0 then 1 + (select count(*) from public.affinity_months a join public.profiles p on p.id = a.player_id
                 where a.month = v_month and a.affinity = mine and a.influence > my_influence and not p.test_account) end,
    'top', (select json_agg(json_build_object('id', t.player_id, 'name', t.display_name, 'influence', t.influence) order by t.influence desc)
            from (select a.player_id, p.display_name, a.influence
                  from public.affinity_months a
                  join public.profiles p on p.id = a.player_id
                  join auth.users u on u.id = a.player_id
                  where a.month = v_month and a.affinity = mine and a.influence > 0
                    and not p.lb_hidden and not p.test_account and not coalesce(u.is_anonymous, false)
                  order by a.influence desc limit 10) t),
    'lastWinner', (select json_build_object('month', f.month, 'winner', f.winner, 'winners', f.winners)
                   from public.faction_months f order by f.month desc limit 1));
end;
$$;

-- ---------------------------------------------------------------- L11: buy_plate names the plate
drop function public.buy_plate();
create function public.buy_plate(p_plate integer) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  costs constant integer[] := array[1000, 2500, 6000, 12000];
  cur smallint;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select plate into cur from public.profiles where id = uid for update;
  if cur >= 4 then raise exception 'top_plate'; end if;
  -- a repeated request for a plate already bought does nothing
  if p_plate is null or p_plate <= cur then raise exception 'plate_owned'; end if;
  if p_plate <> cur + 1 then raise exception 'plate_order'; end if;
  update public.profiles set stardust = stardust - costs[p_plate], plate = p_plate
    where id = uid and stardust >= costs[p_plate];
  if not found then raise exception 'not_enough_stardust'; end if;
  insert into private.ledger (player_id, reason, ref, stardust) values (uid, 'plate', p_plate::text, -costs[p_plate]);
  return json_build_object('plate', p_plate);
end;
$$;

-- ---------------------------------------------------------------- L10: filling in a Daily closes its game
-- As in stardust_sinks, and a Daily already open for that day is closed (it can't be
-- finished for a second reward once the day is filled in).
create or replace function public.mend_daily(p_date date) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  month_start date := date_trunc('month', current_date)::date;
  used integer;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_date is null or p_date < month_start or p_date >= current_date then raise exception 'bad_date'; end if;
  perform 1 from public.profiles where id = uid for update;
  if exists (select 1 from public.games where user_id = uid and mode = 'daily' and won and date_key = p_date)
     or exists (select 1 from public.daily_mends where player_id = uid and date_key = p_date) then
    raise exception 'already_solved';
  end if;
  select count(*) into used from public.daily_mends where player_id = uid and date_key >= month_start;
  if used >= 3 then raise exception 'no_mends_left'; end if;
  update public.profiles set stardust = stardust - 300 where id = uid and stardust >= 300;
  if not found then raise exception 'not_enough_stardust'; end if;
  insert into public.daily_mends (player_id, date_key) values (uid, p_date);
  update public.games set finished_at = now(), won = false, seconds = 0
    where user_id = uid and mode = 'daily' and date_key = p_date and finished_at is null;
  insert into private.ledger (player_id, reason, ref, stardust) values (uid, 'mend', p_date::text, -300);
  return json_build_object('date', p_date, 'left', 2 - used);
end;
$$;

-- ---------------------------------------------------------------- L16: showcase and country
create or replace function public.set_showcase(p_badges text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  b text;
  v text[] := coalesce(p_badges, '{}');
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if cardinality(v) > 3 or cardinality(v) <> (select count(distinct x) from unnest(v) x) then raise exception 'bad_request'; end if;
  foreach b in array v loop
    if not exists (select 1 from public.player_badges where player_id = me and badge = b) then raise exception 'not_owned'; end if;
  end loop;
  update public.profiles set showcase = v where id = me;
end;
$$;

-- the countries the app offers (packages/web/src/screens/privacy.ts CODES)
create function private.country_codes() returns text[]
language sql immutable set search_path = '' as $$
  select string_to_array('AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS XK YE ZA ZM ZW', ' ');
$$;

create or replace function public.set_country(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v text := upper(nullif(trim(coalesce(p_code, '')), ''));
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if v is not null and not (v = any (private.country_codes())) then raise exception 'bad_request'; end if;
  update public.profiles set country = v where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------- L6: the ledger adds up
insert into private.ledger (player_id, reason, ref, stardust, spirits)
  select p.id, case when p.test_account then 'dev_adjust' else 'opening' end, 'review_integrity',
         p.stardust - coalesce(l.dust, 0), p.spirits - coalesce(l.spirits, 0)
  from public.profiles p
  left join (select player_id, sum(stardust) as dust, sum(spirits) as spirits from private.ledger group by player_id) l
    on l.player_id = p.id
  where p.stardust <> coalesce(l.dust, 0) or p.spirits <> coalesce(l.spirits, 0);

-- ---------------------------------------------------------------- L4: grants and balances
revoke all on public.squares from anon, authenticated;
revoke all on public.follows, public.badges, public.player_badges, public.faction_months from anon;
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;
-- (only Supabase's own per-schema grant to anon can be taken back here; PUBLIC's EXECUTE on
-- new functions stays, so every migration still revokes its functions from public, anon)
alter default privileges in schema public revoke execute on functions from anon;
alter table public.profiles add constraint profiles_balances_nonnegative check (stardust >= 0 and spirits >= 0);

-- ---------------------------------------------------------------- grants
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.buy_plate(integer) from public, anon;
grant execute on function public.buy_plate(integer) to authenticated;

-- ---------------------------------------------------------------- L3: the title on confirming
-- Last, so auth.users is locked only for a moment. The original trigger (insert or update of
-- email) stays; this one catches the confirmation.
create trigger on_auth_user_confirmed_title
  after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function private.apply_founder_title();
