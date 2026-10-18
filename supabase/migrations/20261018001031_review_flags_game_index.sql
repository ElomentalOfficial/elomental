-- D1: index the foreign key from review flags to their game (advisor:
-- unindexed foreign key). Speeds up the lookups and deletes that follow
-- review_flags.game_id -> games.id; changes no data and no behavior.

create index if not exists review_flags_game on private.review_flags (game_id);
