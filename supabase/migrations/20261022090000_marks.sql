-- Marks (docs/PROGRESSION_DESIGN.md, "Collection for the long run"; owner 2026-10-22): the frame
-- you wear earns a mark every 40 rated wins, up to 3 (120 wins). A frame with 3 marks can later
-- be gilded (phase 5).
--
-- A win counts when finish_game paid it XP: a rated win, past the pace guard, never in dev mode.
-- It goes to the frame worn when the game finished. Kept per owned frame (player_parts.wins), so
-- taking a frame off keeps what it earned.

alter table public.player_parts add column wins integer not null default 0;

create function private.mark_win() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.player_parts pp set wins = least(pp.wins + 1, 120)
    from public.avatar_loadouts l
    where l.player_id = new.user_id and pp.player_id = new.user_id and pp.part_id = l.frame and pp.wins < 120;
  return new;
end;
$$;

create trigger games_mark_win after update of finished_at on public.games
  for each row when (old.finished_at is null and new.finished_at is not null and new.won and coalesce(new.xp, 0) > 0)
  execute function private.mark_win();

revoke execute on all functions in schema private from public, anon, authenticated;
