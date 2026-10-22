-- Fresh start (the owner, 2026-10-22): the game as if it had just opened. Run once by hand
-- (SQL editor or MCP), beta first, then live; not a migration (no schema change).
--
-- * Backup: every table touched, copied into schema backup_20261022 (not exposed to the API).
-- * Guest accounts (no email) are deleted: their devices start a new guest on the next visit.
-- * Registered accounts keep their sign-in, email, authenticator, name and title (Founder);
--   everything else is a new sign-up's defaults. Founders become normal players: no dev mode,
--   not test accounts (they're listed and earn like anyone; the dev tools are beta-only).
-- * All game history goes: games (with their audits, drops and flags), square codes, clashes,
--   parts and badges, follows, influence and month results, the Stardust ledger, moderation,
--   the founder log, rate limits; forged edition counts go back to 0. The leaderboard is rebuilt.
-- Seasons, parts, badges (the catalogues), founders, testers and app flags stay.

begin;
set local lock_timeout = '10s';

-- ---------------------------------------------------------------- backup
create schema backup_20261022;
revoke all on schema backup_20261022 from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array[
    'public.profiles', 'public.games', 'public.squares', 'public.clashes', 'public.player_parts',
    'public.avatar_loadouts', 'public.player_badges', 'public.drops', 'public.daily_mends',
    'public.affinity_months', 'public.faction_months', 'public.follows', 'public.parts',
    'private.ledger', 'private.review_flags', 'private.moderation_log', 'private.ranked_restrictions',
    'private.founder_log', 'private.game_audits', 'private.season_resets', 'private.app_flags']
  loop
    execute format('create table backup_20261022.%I as table %s', replace(t, '.', '__'), t);
  end loop;
end $$;
create table backup_20261022.deleted_guests as select id, created_at, last_sign_in_at from auth.users where is_anonymous;

-- ---------------------------------------------------------------- what registered players keep
create temp table keep on commit drop as
  select p.id, p.display_name, p.title from public.profiles p join auth.users u on u.id = p.id
   where not coalesce(u.is_anonymous, false);

-- ---------------------------------------------------------------- clear the game
delete from public.clashes where true;      -- (their games go with them)
delete from public.games where true;        -- with audits, drops and review flags
delete from public.squares where true;
delete from public.faction_months where true;
delete from private.ledger where true;
delete from private.moderation_log where true;
delete from private.founder_log where true;
delete from private.rate_hits where true;
delete from private.search_hits where true;
update public.parts set editions_forged = 0 where editions_forged <> 0;
update private.app_flags set enabled = false where name = 'show_founders';

-- every profile goes (with its parts, badges, loadout, follows, influence, mends, restrictions)
delete from public.profiles where true;
-- guests go entirely
delete from auth.users where is_anonymous;
-- registered players come back as new sign-ups, with their name and title
insert into public.profiles (id, display_name, title) select id, display_name, title from keep;

select private.refresh_lb();

-- what's left, for the check
select (select count(*) from auth.users) as accounts,
       (select count(*) from public.profiles) as profiles,
       (select count(*) from public.games) as games,
       (select count(*) from public.profiles where elo <> (select elo from public.profiles limit 1)) as elo_differs,
       (select count(*) from public.profiles where test_account or dev_mode) as test_or_dev,
       (select string_agg(display_name || coalesce(' (' || title || ')', ''), ', ') from public.profiles) as players;
commit;
