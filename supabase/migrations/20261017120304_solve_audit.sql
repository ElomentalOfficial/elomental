-- Ranked wins must be worked out, not typed in from a solver.
--
-- The app sends its moves to the audit-solve Edge Function, which replays them
-- (packages/engine/src/audit.ts) and writes the verdict to games.audit,
-- together with the puzzle's rating graded on the server and its solution.
-- finish_game rates a Ranked win only with a clean audit whose solution
-- matches the submitted grid. Otherwise the win is unrated: no Elo, no speed
-- bonus, 1 Stardust, no rare drop, and a row in private.review_flags.
-- Losses are unaffected.

alter table public.games add column audit jsonb;

-- Only readable from the dashboard (the private schema isn't exposed to the API).
create table private.review_flags (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid references public.games (id) on delete cascade,
  reason text not null,
  audit jsonb,
  created_at timestamptz not null default now()
);
create index review_flags_user on private.review_flags (user_id, created_at desc);
