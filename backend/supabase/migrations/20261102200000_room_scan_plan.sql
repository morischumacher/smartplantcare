-- Exact room geometry from an IFC scan (iPhone LiDAR app), converted to the floor_plan format in the
-- browser. plan-room keeps it unchanged and only adds heaters, plants and missing furniture.
alter table rooms add column scan_plan jsonb;
