-- Review dashboard search (web: screens/review.ts): find a player's whole
-- case by name, email or account id, however long the queue and history are.
--
--   admin_search(query, limit?)  players with a case (a flag, a ban or a
--   decision) whose name or email contains the query, or whose id is the
--   query. Each comes with their decisions, newest first.
--
-- Exact matches come first, then names starting with it, then the rest;
-- banned players and open flags before settled ones. Founders only.

create function public.admin_search(p_query text, p_limit integer default 20)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  -- The query is matched literally: % and _ are not wildcards.
  v_like text;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_items json;
begin
  if not private.is_admin(auth.uid()) then raise exception 'not_admin'; end if;
  if length(v_query) < 2 then return '[]'::json; end if;
  v_like := '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  select coalesce(json_agg(
    (private.review_player(m.id, false)::jsonb || jsonb_build_object('log', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'at', l.created_at, 'userId', l.user_id, 'name', m.display_name,
        'action', l.action, 'days', l.days, 'note', l.note, 'flags', l.flags, 'by', b.display_name
      ) order by l.created_at desc, l.id desc)
      from (select * from private.moderation_log where user_id = m.id order by created_at desc, id desc limit 50) l
      left join public.profiles b on b.id = l.by_user
    ), '[]'::jsonb)))::json
    order by m.rank, m.banned desc, m.open desc, m.display_name
  ), '[]'::json) into v_items
  from (
    select p.id, p.display_name,
      case
        when p.id::text = v_query or lower(p.display_name) = v_query or lower(u.email) = v_query then 0
        when lower(p.display_name) like ltrim(v_like, '%') then 1
        else 2
      end as rank,
      exists (select 1 from private.ranked_restrictions r where r.user_id = p.id and (r.until is null or r.until > now())) as banned,
      exists (select 1 from private.review_flags f where f.user_id = p.id and not f.reviewed) as open
    from public.profiles p
    left join auth.users u on u.id = p.id
    where (p.id::text = v_query or lower(p.display_name) like v_like or lower(u.email) like v_like)
      and (exists (select 1 from private.review_flags f where f.user_id = p.id)
        or exists (select 1 from private.ranked_restrictions r where r.user_id = p.id)
        or exists (select 1 from private.moderation_log l where l.user_id = p.id))
    order by rank, banned desc, open desc, p.display_name
    limit v_limit
  ) m;
  return v_items;
end;
$$;

revoke execute on function public.admin_search(text, integer) from public, anon;
grant execute on function public.admin_search(text, integer) to authenticated;
