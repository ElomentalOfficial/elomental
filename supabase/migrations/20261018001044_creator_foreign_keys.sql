-- D2: who made a square code, and which founder made a review decision,
-- now point at a real player (as clashes.created_by already does). If an
-- account were ever deleted, its rows stay and the link becomes null.
-- Every existing row already matches a player (checked before writing this),
-- so the constraints are added and validated in one go. Each gets an index,
-- as foreign keys here do (clashes_created_by).

alter table public.squares
  add constraint squares_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null;
create index if not exists squares_created_by on public.squares (created_by);

alter table private.moderation_log
  add constraint moderation_log_by_user_fkey foreign key (by_user) references public.profiles (id) on delete set null;
create index if not exists moderation_log_by_user on private.moderation_log (by_user);
