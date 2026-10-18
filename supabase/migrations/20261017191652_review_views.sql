-- Plain-English review of flagged Ranked solves, for the dashboard
-- (Table Editor → schema "private"):
--   review_by_player  one row per player, most flagged first
--   review_queue      one row per flagged game, newest first
-- Tick review_flags.reviewed (and add a note) once you've looked at one;
-- reviewed rows sink to the bottom of both views.
-- The private schema isn't exposed to the API, so players can't read these.

alter table private.review_flags
  add column reviewed boolean not null default false,
  add column note text;

create view private.review_queue with (security_invoker = true) as
select
  to_char(f.created_at at time zone 'utc', 'YYYY-MM-DD HH24:MI') || ' UTC' as "when",
  p.display_name as player,
  coalesce(nullif(u.email, ''), 'guest') as email,
  case
    when f.reason = 'unchecked' then 'Not checked'
    when (f.audit ->> 'potential')::numeric > 0
      and (f.audit ->> 'evidence')::numeric < 0 then 'Very likely copied'
    else 'Likely copied'
  end as verdict,
  case
    when f.reason = 'unchecked' then
      'The app never sent its moves for checking, usually a dropped connection. One on its own means little.'
    when f.audit ->> 'solution' is null then
      'The puzzle it reported was not a valid Sudoku.'
    else
      format('%s of %s squares were filled in before they could be worked out.',
        f.audit ->> 'leaps', f.audit ->> 'placements')
  end as why,
  g.rating as puzzle_rating,
  g.seconds as seconds_taken,
  f.reviewed,
  f.note,
  f.id as flag_id,
  f.game_id
from private.review_flags f
join public.profiles p on p.id = f.user_id
left join auth.users u on u.id = f.user_id
left join public.games g on g.id = f.game_id
order by f.reviewed, f.created_at desc;

create view private.review_by_player with (security_invoker = true) as
select
  p.display_name as player,
  coalesce(nullif(u.email, ''), 'guest') as email,
  count(*) filter (where not f.reviewed) as to_review,
  count(*) filter (where f.reason = 'copied') as copied,
  count(*) filter (where f.reason = 'unchecked') as not_checked,
  to_char(max(f.created_at) at time zone 'utc', 'YYYY-MM-DD HH24:MI') || ' UTC' as last_flag,
  case
    when count(*) filter (where f.reason = 'copied') >= 3 then 'Repeatedly copies answers: worth a closer look.'
    when count(*) filter (where f.reason = 'copied') >= 1 then 'Copied at least once.'
    else 'Only unchecked solves (connection), probably fine.'
  end as summary,
  p.elo,
  f.user_id
from private.review_flags f
join public.profiles p on p.id = f.user_id
left join auth.users u on u.id = f.user_id
group by f.user_id, p.display_name, u.email, p.elo
order by count(*) filter (where not f.reviewed) = 0, count(*) filter (where f.reason = 'copied') desc, max(f.created_at) desc;
