-- Daily Square: a failed attempt (three strikes or conceded) no longer locks
-- the day. Players can retry the same square until they solve it; only a solve
-- marks the day on the calendar and pays out. Still one open attempt at a
-- time, and one solve per day.

drop index public.games_one_daily;
create unique index games_daily_one_win on public.games (user_id, date_key) where mode = 'daily' and won;
create unique index games_daily_one_open on public.games (user_id, date_key) where mode = 'daily' and finished_at is null;

create or replace function public.start_game(
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
  target integer;
  today date := (now() at time zone 'utc')::date;
begin
  if uid is null then raise exception 'not_signed_in'; end if;

  if p_mode = 'ranked' then
    -- An open ranked game left behind counts as a loss, so restarting can't
    -- be used to fish for an easier square.
    perform public.finish_game(id, false, 0, 0, null, null, null)
      from public.games where user_id = uid and mode = 'ranked' and finished_at is null;
    select private.ranked_target(elo) into target from public.profiles where id = uid;
    diff := private.rating_difficulty(target);
    insert into public.games (user_id, mode, difficulty, seed, rating)
      values (uid, 'ranked', diff, 'ranked:' || replace(gen_random_uuid()::text, '-', ''), target)
      returning * into g;
    return json_build_object('game_id', g.id, 'seed', g.seed, 'difficulty', g.difficulty,
      'target_rating', target, 'resumed', false);

  elsif p_mode = 'casual' then
    if p_difficulty is null or p_difficulty not in ('easy', 'medium', 'hard') then raise exception 'bad_difficulty'; end if;
    insert into public.games (user_id, mode, difficulty, seed, rating)
      values (uid, 'casual', p_difficulty, 'casual:' || replace(gen_random_uuid()::text, '-', ''), private.clamp_rating(p_difficulty, null))
      returning * into g;

  elsif p_mode = 'daily' then
    -- The player's local date (3 AM reset) must be within a day of UTC today.
    if p_date_key is null or p_date_key not between today - 1 and today + 1 then raise exception 'bad_date'; end if;
    -- Solved already: done for the day. A failed attempt allows another try.
    if exists (select 1 from public.games where user_id = uid and mode = 'daily' and date_key = p_date_key and won) then
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
revoke execute on function public.start_game(text, text, date, text) from public, anon;
grant execute on function public.start_game(text, text, date, text) to authenticated;
