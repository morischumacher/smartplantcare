-- Height of a plant above the floor on the room map (floor, windowsill, shelf, stacked in a cupboard).
alter table plants add column map_height_m numeric(3,2);
alter table plant_candidates add column map_height_m numeric(3,2);
