-- Elomental core schema: player profiles, games, clashes.
--
-- Trust model: the browser never writes progress directly. Every table is
-- read-only to clients (RLS); games start and finish through security-definer
-- functions that pick the seed, keep the clock, check the solved grid and
-- compute Stardust, drops and Elo on the server.

-- Internal helpers live in a schema the API does not expose.
create schema if not exists private;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    check (char_length(display_name) between 3 and 20 and display_name ~ '^[A-Za-z0-9_. -]+$'),
  elo integer not null default 100 check (elo >= 0),
  ranked_games integer not null default 0,
  stardust integer not null default 0,
  crowns integer not null default 0,
  -- Wins since the last rare drop; a drop is guaranteed at 40.
  pity integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index profiles_display_name_key on public.profiles (lower(display_name));

alter table public.profiles enable row level security;
create policy "Players read their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

-- Every new account (magic link / email code) gets a profile.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, 'Player-' || substr(replace(new.id::text, '-', ''), 1, 8));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------- clashes
create table public.clashes (
  code text primary key check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$'),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.clashes enable row level security;
create policy "Signed-in players can look up clash codes" on public.clashes
  for select to authenticated using (true);

-- ---------------------------------------------------------------- games
create table public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('casual', 'daily', 'ranked', 'clash')),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  seed text not null,
  date_key date,
  clash_code text references public.clashes (code) on delete cascade,
  rating integer not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  won boolean,
  seconds integer,
  mistakes smallint,
  hints smallint,
  elo_before integer,
  elo_after integer,
  stardust integer not null default 0,
  crown boolean not null default false,
  check (mode <> 'daily' or date_key is not null),
  check (mode <> 'clash' or clash_code is not null)
);
-- One daily square per day and one attempt per clash code, per player.
create unique index games_one_daily on public.games (user_id, date_key) where mode = 'daily';
create unique index games_one_clash on public.games (user_id, clash_code) where mode = 'clash';
create index games_user_started on public.games (user_id, started_at desc);
create index games_clash_code on public.games (clash_code) where clash_code is not null;

alter table public.games enable row level security;
create policy "Players read their own games" on public.games
  for select to authenticated using ((select auth.uid()) = user_id);

-- Clients only ever read; all writes go through the functions below.
revoke insert, update, delete, truncate on public.profiles, public.games, public.clashes from anon, authenticated;
revoke all on public.profiles, public.games, public.clashes from anon;

-- ---------------------------------------------------------------- helpers
create function private.code_difficulty(code text) returns text
language sql immutable set search_path = '' as $$
  select (array['easy', 'medium', 'hard'])[
    (position(substr(code, 1, 1) in 'ABCDEFGHJKMNPQRSTUVWXYZ23456789') - 1) % 3 + 1
  ];
$$;

-- Puzzle ratings the generator produces per difficulty (measured on 60 puzzles each);
-- a reported rating is clamped into its band so it cannot inflate Elo.
create function private.clamp_rating(difficulty text, reported integer) returns integer
language sql immutable set search_path = '' as $$
  select case difficulty
    when 'easy' then least(greatest(coalesce(reported, 160), 150), 200)
    when 'medium' then least(greatest(coalesce(reported, 400), 340), 760)
    else least(greatest(coalesce(reported, 1100), 950), 1450)
  end;
$$;

-- A finished grid must be a valid sudoku: 81 digits 1-9, no repeats in any row, column or box.
create function private.valid_solution(grid text) returns boolean
language sql immutable set search_path = '' as $$
  select grid ~ '^[1-9]{81}$' and not exists (
    select 1
    from generate_series(0, 80) as i,
         lateral (values ('r' || (i / 9)), ('c' || (i % 9)), ('b' || ((i / 27) * 3 + (i % 9) / 3))) as u (unit)
    group by u.unit
    having count(distinct substr(grid, i + 1, 1)) <> 9
  );
$$;

-- Puzzle-as-opponent Elo; provisional players move faster; no loss below 500.
create function private.elo_delta(player integer, puzzle integer, won boolean, games_played integer) returns integer
language plpgsql immutable set search_path = '' as $$
declare
  expected double precision := 1 / (1 + power(10, (puzzle - player) / 400.0));
  k integer := case when games_played < 20 then 40 else 24 end;
  delta integer := round(k * ((case when won then 1 else 0 end) - expected));
begin
  if delta < 0 and player < 500 then return 0; end if;
  return delta;
end;
$$;

create function private.speed_bonus(seconds integer, difficulty text) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when r <= 0.5 then 0.25
    when r <= 0.75 then 0.15
    when r <= 1 then 0.10
    when r <= 2 then 0
    else -0.25
  end
  from (select seconds::numeric / case difficulty when 'easy' then 360 when 'medium' then 720 else 1200 end as r) as t;
$$;

-- ---------------------------------------------------------------- start_game
-- Picks the seed (ranked/casual random, daily by date, clash by code) and starts
-- the server clock. Returns the game to resume when one is already open.
create function public.start_game(
  p_mode text,
  p_difficulty text default null,
  p_date_key date default null,
  p_clash_code text default null
) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g public.games;
  diff text;
  today date := (now() at time zone 'utc')::date;
begin
  if uid is null then raise exception 'not_signed_in'; end if;

  if p_mode = 'ranked' then
    -- An open ranked game left behind counts as a loss, so restarting can't
    -- be used to fish for an easier square.
    perform public.finish_game(id, false, 0, 0, null, null, null)
      from public.games where user_id = uid and mode = 'ranked' and finished_at is null;
    select case when elo < 300 then 'easy' when elo < 750 then 'medium' else 'hard' end
      into diff from public.profiles where id = uid;
    insert into public.games (user_id, mode, difficulty, seed, rating)
      values (uid, 'ranked', diff, 'ranked:' || replace(gen_random_uuid()::text, '-', ''), private.clamp_rating(diff, null))
      returning * into g;

  elsif p_mode = 'casual' then
    if p_difficulty is null or p_difficulty not in ('easy', 'medium', 'hard') then raise exception 'bad_difficulty'; end if;
    insert into public.games (user_id, mode, difficulty, seed, rating)
      values (uid, 'casual', p_difficulty, 'casual:' || replace(gen_random_uuid()::text, '-', ''), private.clamp_rating(p_difficulty, null))
      returning * into g;

  elsif p_mode = 'daily' then
    -- The player's local date (3 AM reset) must be within a day of UTC today.
    if p_date_key is null or p_date_key not between today - 1 and today + 1 then raise exception 'bad_date'; end if;
    select * into g from public.games where user_id = uid and mode = 'daily' and date_key = p_date_key;
    if found then
      if g.finished_at is not null then raise exception 'daily_done'; end if;
      return json_build_object('game_id', g.id, 'seed', g.seed, 'difficulty', g.difficulty, 'resumed', true);
    end if;
    insert into public.games (user_id, mode, difficulty, seed, date_key, rating)
      values (uid, 'daily', 'medium', 'daily:' || to_char(p_date_key, 'YYYY-MM-DD'), p_date_key, private.clamp_rating('medium', null))
      returning * into g;

  elsif p_mode = 'clash' then
    if p_clash_code is null or p_clash_code !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$' then raise exception 'bad_code'; end if;
    diff := private.code_difficulty(p_clash_code);
    insert into public.clashes (code, difficulty, created_by) values (p_clash_code, diff, uid)
      on conflict (code) do nothing;
    select * into g from public.games where user_id = uid and mode = 'clash' and clash_code = p_clash_code;
    if found then
      if g.finished_at is not null then raise exception 'clash_played'; end if;
      return json_build_object('game_id', g.id, 'seed', g.seed, 'difficulty', g.difficulty, 'resumed', true);
    end if;
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
-- Settles a game once: checks the grid, takes the time from the server clock
-- (Ranked and Clash) or the paused-aware client clock capped by it (Casual,
-- Daily), and pays out Stardust, rare drops and Elo.
create function public.finish_game(
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
  elo_json json := null;
  daily_json json := null;
  month_start date;
  days integer;
  done integer;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into g from public.games where id = p_game_id and user_id = uid for update;
  if not found then raise exception 'no_game'; end if;
  if g.finished_at is not null then raise exception 'already_finished'; end if;

  wall := greatest(extract(epoch from now() - g.started_at)::integer, 0);
  secs := case when g.mode in ('ranked', 'clash') then wall
               else least(greatest(coalesce(p_seconds, wall), 0), wall) end;

  if p_won then
    if not private.valid_solution(p_grid) then raise exception 'invalid_solution'; end if;
    -- Nobody fills a whole square this fast by hand.
    min_secs := case g.difficulty when 'easy' then 15 when 'medium' then 30 else 45 end;
    if secs < min_secs then raise exception 'too_fast'; end if;
  end if;

  g.rating := private.clamp_rating(g.difficulty, coalesce(p_rating, g.rating));
  select * into p from public.profiles where id = uid for update;

  if p_won then
    base := case g.mode when 'daily' then 12 when 'ranked' then 20
              else case g.difficulty when 'easy' then 4 when 'medium' then 8 else 15 end end;
    dust := greatest(1, base - v_mistakes * 2 - v_hints);
    p.stardust := p.stardust + dust;
    p.pity := p.pity + 1;
    if p.pity >= 40 or random() < 0.03 then
      v_crown := true;
      p.crowns := p.crowns + 1;
      p.pity := 0;
    end if;
  end if;

  if g.mode = 'ranked' then
    g.elo_before := p.elo;
    delta := private.elo_delta(p.elo, g.rating, p_won, p.ranked_games);
    if p_won and delta > 0 then
      bonus := private.speed_bonus(secs, g.difficulty);
      -- Speed bonus first, then the hint cut, so hints can't be earned back by speed.
      hint_cut := least(1, v_hints * 0.25);
    end if;
    delta := round(delta * (1 + bonus) * (1 - hint_cut));
    p.elo := greatest(0, p.elo + delta);
    p.ranked_games := p.ranked_games + 1;
    g.elo_after := p.elo;
    elo_json := json_build_object('before', g.elo_before, 'after', g.elo_after,
      'protectedLoss', not p_won and delta = 0, 'bonus', bonus, 'hintCut', hint_cut);
  end if;

  update public.profiles
    set elo = p.elo, ranked_games = p.ranked_games, stardust = p.stardust, crowns = p.crowns, pity = p.pity
    where id = uid;
  update public.games
    set finished_at = now(), won = p_won, seconds = secs, mistakes = v_mistakes, hints = v_hints,
        rating = g.rating, elo_before = g.elo_before, elo_after = g.elo_after, stardust = dust, crown = v_crown
    where id = g.id;

  if g.mode = 'daily' then
    month_start := date_trunc('month', g.date_key)::date;
    days := extract(day from (month_start + interval '1 month - 1 day'))::integer;
    select count(*) into done from public.games
      where user_id = uid and mode = 'daily' and won
        and date_key >= month_start and date_key < (month_start + interval '1 month')::date;
    daily_json := json_build_object('done', done, 'days', days, 'monthComplete', done = days);
  end if;

  return json_build_object('seconds', secs, 'dust', dust, 'crown', v_crown, 'elo', elo_json, 'daily', daily_json);
end;
$$;

-- ---------------------------------------------------------------- reads
-- Everyone's finished result for a clash code (both sides see the same board).
create function public.get_clash(p_code text)
returns table (display_name text, is_me boolean, solved boolean, seconds integer, mistakes smallint, hints smallint, finished_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select pr.display_name, g.user_id = auth.uid(), g.won, g.seconds, g.mistakes, g.hints, g.finished_at
  from public.games g join public.profiles pr on pr.id = g.user_id
  where g.mode = 'clash' and g.clash_code = p_code and g.finished_at is not null and auth.uid() is not null
  order by g.finished_at;
$$;

-- Every clash the caller has played, with the opponents' results, newest first.
create function public.my_clashes()
returns table (code text, difficulty text, display_name text, is_me boolean, solved boolean, seconds integer,
               mistakes smallint, hints smallint, finished_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select g.clash_code, c.difficulty, pr.display_name, g.user_id = auth.uid(), g.won, g.seconds, g.mistakes, g.hints, g.finished_at
  from public.games g
  join public.clashes c on c.code = g.clash_code
  join public.profiles pr on pr.id = g.user_id
  where g.mode = 'clash' and g.finished_at is not null
    and g.clash_code in (select clash_code from public.games where user_id = auth.uid() and mode = 'clash')
  order by g.finished_at desc
  limit 200;
$$;

create function public.leaderboard(p_limit integer default 50)
returns table (rank bigint, display_name text, elo integer, ranked_games integer, is_me boolean)
language sql stable security definer set search_path = '' as $$
  select rank() over (order by elo desc), display_name, elo, ranked_games, id = auth.uid()
  from public.profiles where ranked_games > 0
  order by elo desc limit least(greatest(p_limit, 1), 100);
$$;

create function public.set_display_name(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  update public.profiles set display_name = trim(p_name) where id = auth.uid();
exception when unique_violation then
  raise exception 'name_taken';
end;
$$;

-- Only signed-in players may call the API functions; helpers are not callable at all.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.start_game(text, text, date, text),
  public.finish_game(uuid, boolean, integer, integer, integer, integer, text),
  public.get_clash(text), public.my_clashes(), public.leaderboard(integer), public.set_display_name(text)
  to authenticated;
revoke all on schema private from public, anon, authenticated;
