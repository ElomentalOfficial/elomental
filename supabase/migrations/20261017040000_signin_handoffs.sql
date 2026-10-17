-- Sign-in hand-off: lets the installed iPhone app sign in to an existing
-- account although the email link opens in Safari (which has separate
-- storage). Used only by the `handoff` Edge Function (service role):
--   1. The app starts a request: a random id plus a secret only it keeps (we store its hash).
--   2. The email link carries the id; Safari, once signed in by the link, asks the
--      player to confirm (matching code) and marks the request approved for that user.
--   3. The app, polling with its secret, receives a one-time sign-in token.
-- Requests last 10 minutes and work once.
create table public.signin_handoffs (
  id uuid primary key default gen_random_uuid(),
  secret_hash text not null,
  email text not null,
  user_id uuid references auth.users (id) on delete cascade,
  approved_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create index signin_handoffs_email on public.signin_handoffs (lower(email), created_at desc);
create index signin_handoffs_user on public.signin_handoffs (user_id);

-- No client access at all; only the Edge Function (service role) reads or writes it.
alter table public.signin_handoffs enable row level security;
revoke all on public.signin_handoffs from anon, authenticated;
