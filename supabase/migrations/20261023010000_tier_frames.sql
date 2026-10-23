-- Frames by tier (owner, 2026-10-23): the sixteen faction frames (s0-frame-<element>-<1..4>) go,
-- with no refund; five frames for everyone take their place, one per metal and rarity: Bronze and
-- Silver (common), Gold (rare), Epic and Mythic. No element, so private.drop_part offers them to
-- every player (pt.element is null) and none reads as a gift.

-- what pointed at the old frames: worn frames, owned ones, blueprints (cascade), drop history
-- (every frame in the catalogue, by one rule; drops.part_id can't be null, so their rows go)
update public.avatar_loadouts set frame = null where frame in (select id from public.parts where slot = 'frame');
delete from public.player_parts where part_id in (select id from public.parts where slot = 'frame');
delete from public.drops where part_id in (select id from public.parts where slot = 'frame');
delete from public.parts where slot = 'frame';

insert into public.parts (id, slot, element, rarity, season_id, source) values
  ('s0-frame-bronze', 'frame', null, 'common', 0, 'craft'),
  ('s0-frame-silver', 'frame', null, 'common', 0, 'craft'),
  ('s0-frame-gold', 'frame', null, 'rare', 0, 'craft'),
  ('s0-frame-epic', 'frame', null, 'epic', 0, 'craft'),
  ('s0-frame-mythic', 'frame', null, 'mythic', 0, 'craft');

-- the leaderboard snapshot still names the old frames
refresh materialized view private.lb;
