-- Room map: an abstract top-down floor plan per room (derived from room photos by Claude, then
-- corrected by the user) and plant positions on it. All coordinates are in metres, origin top-left.
--
-- floor_plan JSON:
-- {
--   "width_m": 4.2, "depth_m": 3.5,
--   "outline": [[0,0], [4.2,0], [4.2,3.5], [0,3.5]],          -- polygon, clockwise
--   "features": [{ "kind": "window" | "door" | "heater", "x1": 1.0, "y1": 0, "x2": 2.2, "y2": 0 }],
--   "furniture": [{ "label": "Sofa", "x": 0.3, "y": 2.4, "w": 2.0, "h": 0.9 }],
--   "source": "ai" | "manual", "generated_at": "..."
-- }

alter table rooms
  add column photo_paths text[] not null default '{}',   -- room photos in the plant-photos bucket
  add column floor_plan jsonb;

alter table plants
  add column map_x numeric(6,2),
  add column map_y numeric(6,2),
  add constraint plants_map_position check ((map_x is null) = (map_y is null));
