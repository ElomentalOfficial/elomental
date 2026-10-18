-- Player names: calm, puzzle-minded defaults instead of "Player-1a2b3c4d",
-- and a name can be changed once every 15 days. Names stay unique ignoring
-- case (profiles_display_name_key).

alter table public.profiles add column name_changed_at timestamptz;

-- "Quiet Logician", "Steady Navigator", ... Adjective + noun, at most 19
-- characters; a number is added only if every pairing tried is taken.
create function private.generate_display_name() returns text
language plpgsql volatile set search_path = '' as $$
declare
  adjectives text[] := array[
    'Quiet', 'Keen', 'Steady', 'Patient', 'Lucid', 'Deft', 'Astute', 'Calm',
    'Careful', 'Clear', 'Subtle', 'Nimble', 'Bright', 'Focused', 'Measured',
    'Sharp', 'Still', 'Wise', 'Sure', 'Silent'];
  nouns text[] := array[
    'Logician', 'Navigator', 'Tactician', 'Strategist', 'Pathfinder', 'Architect',
    'Reasoner', 'Theorist', 'Observer', 'Analyst', 'Scholar', 'Decoder',
    'Planner', 'Solver', 'Thinker', 'Seeker', 'Mapmaker', 'Weaver', 'Keeper', 'Sage'];
  candidate text;
begin
  for i in 1..40 loop
    candidate := adjectives[1 + floor(random() * array_length(adjectives, 1))::int] || ' ' ||
                 nouns[1 + floor(random() * array_length(nouns, 1))::int];
    if not exists (select 1 from public.profiles where lower(display_name) = lower(candidate)) then
      return candidate;
    end if;
  end loop;
  loop
    candidate := left(candidate, 16) || ' ' || (10 + floor(random() * 90))::int;
    if not exists (select 1 from public.profiles where lower(display_name) = lower(candidate)) then
      return candidate;
    end if;
  end loop;
end;
$$;

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name) values (new.id, private.generate_display_name());
  return new;
end;
$$;

-- Existing default names get one from the list too.
update public.profiles set display_name = private.generate_display_name() where display_name like 'Player-%';

-- Changing the name: once every 15 days (the first change away from the
-- default is free). Raises name_taken, name_invalid or name_cooldown:<when>.
drop function public.set_display_name(text);
create function public.set_display_name(p_name text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  clean text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  p public.profiles;
  next_allowed timestamptz;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into p from public.profiles where id = uid for update;
  if clean = p.display_name then
    return json_build_object('name', p.display_name, 'next_change', p.name_changed_at + interval '15 days');
  end if;
  if char_length(clean) not between 3 and 20 or clean !~ '^[A-Za-z0-9_. -]+$' then
    raise exception 'name_invalid';
  end if;
  next_allowed := p.name_changed_at + interval '15 days';
  if next_allowed is not null and now() < next_allowed then
    raise exception 'name_cooldown:%', to_char(next_allowed at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;
  update public.profiles set display_name = clean, name_changed_at = now() where id = uid;
  return json_build_object('name', clean, 'next_change', now() + interval '15 days');
exception when unique_violation then
  raise exception 'name_taken';
end;
$$;
revoke execute on function public.set_display_name(text) from public, anon;
grant execute on function public.set_display_name(text) to authenticated;
