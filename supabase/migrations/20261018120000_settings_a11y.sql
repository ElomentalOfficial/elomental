-- Accessibility preferences follow the account too (Setup > Accessibility,
-- packages/web/src/a11y.ts). save_settings now also keeps an `a11y` object,
-- with only the keys and values the app knows (the same rules as cleanA11y);
-- anything else sent is ignored. Saved keys merge into what the account has.

create or replace function public.save_settings(p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  clean jsonb := '{}'::jsonb;
  a11y jsonb := '{}'::jsonb;
  incoming jsonb := p_settings->'a11y';
  saved jsonb;
  flag text;
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

  if jsonb_typeof(incoming) = 'object' then
    if incoming->>'textSize' in ('100', '125', '150', '200') and jsonb_typeof(incoming->'textSize') = 'number' then
      a11y := a11y || jsonb_build_object('textSize', (incoming->>'textSize')::int);
    end if;
    if incoming->>'contrast' in ('system', 'standard', 'high') then
      a11y := a11y || jsonb_build_object('contrast', incoming->>'contrast');
    end if;
    if incoming->>'motion' in ('system', 'reduce') then
      a11y := a11y || jsonb_build_object('motion', incoming->>'motion');
    end if;
    foreach flag in array array['colourBlind', 'showTimer', 'highlightLines', 'highlightBox', 'highlightSame',
                                'keepWrong', 'casualMistakeLimit', 'haptics', 'sounds'] loop
      if jsonb_typeof(incoming->flag) = 'boolean' then
        a11y := a11y || jsonb_build_object(flag, incoming->flag);
      end if;
    end loop;
  end if;

  update public.profiles
     set settings = settings || clean
                    || case when a11y = '{}'::jsonb then '{}'::jsonb
                            else jsonb_build_object('a11y', coalesce(settings->'a11y', '{}'::jsonb) || a11y) end
   where id = uid
  returning settings into saved;
  return saved;
end;
$$;
revoke execute on function public.save_settings(jsonb) from public, anon;
grant execute on function public.save_settings(jsonb) to authenticated;
