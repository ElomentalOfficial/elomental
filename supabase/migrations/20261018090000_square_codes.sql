-- Square codes (web: squareCode.ts): a short code for every puzzle, so a
-- player can send a friend the exact square they're playing.
--
--   square_code(givens, difficulty, rating)  the puzzle's code (made on first use;
--                                            the same puzzle always gets the same code)
--   get_square(code)                         the puzzle behind a code
--
-- The code holds the puzzle itself (not the seed it was generated from), so it
-- keeps working whatever changes in the generator. A shared square is played
-- as a Casual game.

create table public.squares (
  code text primary key check (code ~ '^[A-HJKMNP-Z2-9]{8}$'),
  givens text not null unique check (givens ~ '^[0-9]{81}$'),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  rating integer check (rating between 0 and 10000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
-- Only through the functions below.
alter table public.squares enable row level security;

create function public.square_code(p_givens text, p_difficulty text, p_rating integer default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  i integer;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_givens !~ '^[0-9]{81}$' or length(replace(p_givens, '0', '')) < 17 then raise exception 'bad_square'; end if;
  if p_difficulty not in ('easy', 'medium', 'hard') then raise exception 'bad_square'; end if;

  select code into v_code from public.squares where givens = p_givens;
  if found then return v_code; end if;

  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    begin
      insert into public.squares (code, givens, difficulty, rating)
        values (v_code, p_givens, p_difficulty, least(greatest(p_rating, 0), 10000));
      return v_code;
    exception when unique_violation then
      -- The same puzzle registered meanwhile: its code. Otherwise the code was taken: draw again.
      select code into v_code from public.squares where givens = p_givens;
      if found then return v_code; end if;
    end;
  end loop;
end;
$$;

create function public.get_square(p_code text) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object('code', s.code, 'givens', s.givens, 'difficulty', s.difficulty, 'rating', s.rating)
  from public.squares s
  where s.code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

revoke execute on function public.square_code(text, text, integer), public.get_square(text) from public, anon;
grant execute on function public.square_code(text, text, integer), public.get_square(text) to authenticated;
