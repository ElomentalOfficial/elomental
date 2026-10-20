-- Stardust sinks and a fairer pace (docs/AUDIT.md §5–6, approved 2026-10-20):
--
-- * Parts count on the first 9 rated solves a day (3 parts), down from 30, so the most
--   active players don't finish the season set ten times faster than everyone else.
-- * Polish: each owned part can be polished, levels I–V for 200 / 400 / 800 / 1600 / 3200
--   Stardust. Purely a look.
-- * Name plates: Bronze, Silver, Gold, Starlit behind the player's name, for 1000 / 2500 /
--   6000 / 12000 Stardust, bought in order. Purely a look.
-- * Mend a missed Daily: 300 Stardust fills in a missed day of this month (at most 3 a
--   month); it counts toward the month like a solved one.

-- ---------------------------------------------------------------- polish
alter table public.player_parts add column polish smallint not null default 0 check (polish between 0 and 5);

create function public.polish_part(p_part text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  costs constant integer[] := array[200, 400, 800, 1600, 3200];
  lvl smallint;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select polish into lvl from public.player_parts where player_id = uid and part_id = p_part for update;
  if not found then raise exception 'not_owned'; end if;
  if lvl >= 5 then raise exception 'fully_polished'; end if;
  update public.profiles set stardust = stardust - costs[lvl + 1] where id = uid and stardust >= costs[lvl + 1];
  if not found then raise exception 'not_enough_stardust'; end if;
  update public.player_parts set polish = lvl + 1 where player_id = uid and part_id = p_part;
  insert into private.ledger (player_id, reason, ref, stardust) values (uid, 'polish', p_part, -costs[lvl + 1]);
  return json_build_object('part', p_part, 'polish', lvl + 1);
end;
$$;

-- ---------------------------------------------------------------- name plates
alter table public.profiles add column plate smallint not null default 0 check (plate between 0 and 4);

create function public.buy_plate() returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  costs constant integer[] := array[1000, 2500, 6000, 12000];
  cur smallint;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select plate into cur from public.profiles where id = uid for update;
  if cur >= 4 then raise exception 'top_plate'; end if;
  update public.profiles set stardust = stardust - costs[cur + 1], plate = cur + 1
    where id = uid and stardust >= costs[cur + 1];
  if not found then raise exception 'not_enough_stardust'; end if;
  insert into private.ledger (player_id, reason, ref, stardust) values (uid, 'plate', (cur + 1)::text, -costs[cur + 1]);
  return json_build_object('plate', cur + 1);
end;
$$;

-- ---------------------------------------------------------------- mend a missed Daily
create table public.daily_mends (
  player_id uuid not null references public.profiles (id) on delete cascade,
  date_key date not null,
  created_at timestamptz not null default now(),
  primary key (player_id, date_key)
);
alter table public.daily_mends enable row level security;
create policy "Players read their mends" on public.daily_mends
  for select to authenticated using ((select auth.uid()) = player_id);
revoke insert, update, delete, truncate on public.daily_mends from anon, authenticated;
revoke all on public.daily_mends from anon;

-- A missed day of this month (before today) that wasn't solved: 300 Stardust, 3 a month.
create function public.mend_daily(p_date date) returns json
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
  insert into private.ledger (player_id, reason, ref, stardust) values (uid, 'mend', p_date::text, -300);
  return json_build_object('date', p_date, 'left', 2 - used);
end;
$$;

-- ---------------------------------------------------------------- finish_game
-- As in simple_economy, with parts counted on the first 9 solves a day and mended days
-- counted toward the month.
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

  -- Rated solves count toward the next part (first 9 a day: 3 parts) and the affinity (first 25), UTC days.
  if p_won and unrated is null then
    select count(*) into solved_today from public.games
      where user_id = uid and won and finished_at >= date_trunc('day', now()) and id <> g.id;
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

  return json_build_object('seconds', secs, 'dust', dust, 'crown', v_crown, 'elo', elo_json, 'daily', daily_json,
    'drop', drop_json, 'progress', progress_json,
    'influence', case when influence > 0 then json_build_object('affinity', p.affinity, 'amount', influence) end);
end;
$$;


-- ---------------------------------------------------------------- grants
revoke execute on function public.polish_part(text), public.buy_plate(), public.mend_daily(date) from public, anon;
grant execute on function public.polish_part(text), public.buy_plate(), public.mend_daily(date) to authenticated;