-- Player settings follow the account to every device: theme, notes wheel and
-- whether the tutorial was seen. Only these keys, with these types, are kept;
-- anything else sent is ignored.

alter table public.profiles add column settings jsonb not null default '{}'::jsonb;

create function public.save_settings(p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  clean jsonb := '{}'::jsonb;
  saved jsonb;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_settings->>'theme' in ('dark', 'light') then
    clean := clean || jsonb_build_object('theme', p_settings->>'theme');
  end if;
  if jsonb_typeof(p_settings->'notesWheel') = 'boolean' then
    clean := clean || jsonb_build_object('notesWheel', p_settings->'notesWheel');
  end if;
  if jsonb_typeof(p_settings->'tutorialDone') = 'boolean' then
    clean := clean || jsonb_build_object('tutorialDone', p_settings->'tutorialDone');
  end if;
  update public.profiles set settings = settings || clean where id = uid returning settings into saved;
  return saved;
end;
$$;
revoke execute on function public.save_settings(jsonb) from public, anon;
grant execute on function public.save_settings(jsonb) to authenticated;
