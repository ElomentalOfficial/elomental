-- Any signed-in account (guests included: anonymous sign-ins use the
-- `authenticated` role) could list every Clash code and who made it, then
-- play or spoil other people's clashes. The app never reads the table
-- directly: it looks codes up through get_clash() and my_clashes(), which are
-- security definer and keep working without this policy. RLS stays on, so
-- with no policy left, clients can't read the table at all.
drop policy if exists "Signed-in players can look up clash codes" on public.clashes;
