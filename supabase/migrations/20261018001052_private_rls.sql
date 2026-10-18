-- D3: row level security on the three private tables that didn't have it
-- (moderation_log already does). Defense in depth: the private schema isn't
-- reachable from the API at all (only its owner, postgres, may use it), and
-- everything that reads these tables (the game, review and admin functions,
-- the review views, the SQL Editor) runs as that owner, which RLS doesn't
-- restrict. No policies are needed and nothing changes for players.

alter table private.founders enable row level security;
alter table private.review_flags enable row level security;
alter table private.ranked_restrictions enable row level security;
