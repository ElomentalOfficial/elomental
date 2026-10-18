-- Player titles: a fixed title (e.g. "Founder") shown instead of the Elo rank.
-- Founders are listed by email in private.founders; the emails are added
-- straight in the database, never committed (this repository is public).
-- An account gets the title when it's created with, or later confirms, one
-- of those emails (a guest attaching it included).

alter table public.profiles add column title text;

create table private.founders (email text primary key);

create function private.apply_founder_title() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null and exists (select 1 from private.founders f where lower(f.email) = lower(new.email)) then
    update public.profiles set title = 'Founder' where id = new.id;
  end if;
  return new;
end;
$$;

-- Named to run after on_auth_user_created, which makes the profile.
create trigger on_auth_user_email_title
  after insert or update of email on auth.users
  for each row execute function private.apply_founder_title();
