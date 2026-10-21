-- Explicit Data API grants for everything in public.
--
-- From October 30, 2026, Supabase stops granting the API roles access to new
-- tables and functions in public automatically. Earlier migrations created
-- tables and relied on those automatic grants (they only revoked what players
-- must not have), so a fresh rebuild - a preview branch, a new project, or
-- `supabase db reset` - would leave players unable to read any table.
--
-- This migration writes down the access the live project has today, so a
-- rebuild ends up identical. On the live project it changes nothing: every
-- grant below already exists.
--
-- (Applied to the live project as 20261021015519; copied into the repo from the live
-- project's migration history, word for word, so a beta project can be built from here.)

-- ---------------------------------------------------------------- tables
-- Players read through RLS; all writes go through security definer functions.
grant select on
  public.affinity_months,
  public.avatar_loadouts,
  public.badges,
  public.clashes,
  public.daily_mends,
  public.drops,
  public.faction_months,
  public.follows,
  public.games,
  public.parts,
  public.player_badges,
  public.player_parts,
  public.profiles,
  public.seasons
to authenticated;
-- public.squares is deliberately not readable directly: get_square() serves it.

grant select, insert, update, delete, truncate, references, trigger on
  public.affinity_months,
  public.avatar_loadouts,
  public.badges,
  public.clashes,
  public.daily_mends,
  public.drops,
  public.faction_months,
  public.follows,
  public.games,
  public.parts,
  public.player_badges,
  public.player_parts,
  public.profiles,
  public.seasons,
  public.squares
to service_role;

-- ---------------------------------------------------------------- functions
grant execute on function
  public.admin_moderate(p_user uuid, p_action text, p_days integer, p_note text),
  public.admin_review(),
  public.admin_review_page(p_view text, p_limit integer, p_offset integer),
  public.admin_search(p_query text, p_limit integer),
  public.affinity_standings(),
  public.buy_plate(p_plate integer),
  public.call_spirit(),
  public.choose_affinity(p_affinity text),
  public.dev_action(p_action text, p_value text),
  public.dev_set_mode(p_on boolean),
  public.dev_show_founders(p_on boolean),
  public.equip_part(p_slot text, p_part text),
  public.faction_board(),
  public.finish_game(p_game_id uuid, p_won boolean, p_mistakes integer, p_hints integer, p_seconds integer, p_rating integer, p_grid text),
  public.follow(p_player uuid),
  public.forge_part(p_part text),
  public.founder_activity(p_limit integer),
  public.founder_status(),
  public.founders_shown(),
  public.get_clash(p_code text),
  public.get_square(p_code text),
  public.lb_around_me(p_view text, p_scope text),
  public.lb_me(p_view text, p_scope text),
  public.lb_page(p_view text, p_page integer, p_scope text),
  public.lb_search(p_query text),
  public.lb_tiers(),
  public.mend_daily(p_date date),
  public.my_clashes(),
  public.pause_game(p_game_id uuid),
  public.player_card(p_player uuid),
  public.polish_part(p_part text),
  public.resume_game(p_game_id uuid),
  public.save_settings(p_settings jsonb),
  public.set_card_privacy(p_hidden boolean, p_stats boolean),
  public.set_country(p_code text),
  public.set_display_name(p_name text),
  public.set_showcase(p_badges text[]),
  public.square_code(p_givens text, p_difficulty text, p_rating integer),
  public.start_game(p_mode text, p_difficulty text, p_date_key date, p_clash_code text),
  public.unfollow(p_player uuid)
to authenticated, service_role;

-- Server-only: the solve audit is written by the backend, never by players.
grant execute on function
  public.audit_slot(p_game uuid, p_user uuid),
  public.save_audit(p_game uuid, p_audit jsonb)
to service_role;

-- ---------------------------------------------------------------- from here on
-- Opt in to the new behavior now instead of on October 30, so a table or
-- function added without a grant fails in development rather than after a
-- reset. Every later migration must grant what it creates.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;
