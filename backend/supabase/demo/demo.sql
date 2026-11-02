-- Demo data: one room, one plant with 14 days of simulated readings. Run in the Supabase
-- SQL Editor to try `summary` before the hardware arrives; remove with demo_cleanup.sql.
--
-- The plant dries 4 points/day and was watered 10 and 4 days ago (back to 45 %).
-- Only the first watering is logged, so the second shows up as "pending" for confirmation.

with room as (
  insert into rooms (name, humidity_min, humidity_max) values ('Demo-Raum', 40, 60) returning id
), sensors_ins as (
  insert into sensors (mac, type, name, room_id)
  select * from (values
    ('DE:AD:BE:EF:00:01', 'flower_care'::sensor_type, 'Demo Flower Care', null::uuid),
    ('DE:AD:BE:EF:00:02', 'hygrometer'::sensor_type, 'Demo Hygrometer', (select id from room))
  ) v
  returning id, type
), plant as (
  insert into plants (name, species, room_id, moisture_min, moisture_max, photo_interval_days)
  select 'Demo-Monstera', 'Monstera deliciosa', id, 20, 45, 14 from room
  returning id
), pot as (
  insert into pots (plant_id, started_at, volume_l, soil_type)
  select id, now() - interval '30 days', 3, 'universal' from plant
), link as (
  insert into plant_sensors (plant_id, sensor_id)
  select plant.id, s.id from plant, sensors_ins s where s.type = 'flower_care'
), watering as (
  insert into waterings (plant_id, ts, amount_ml)
  select id, date_trunc('hour', now()) - interval '10 days', 240 from plant
), ticks as (
  select t, extract(epoch from (t - (date_trunc('hour', now()) - interval '14 days'))) / 86400 as day
  from generate_series(date_trunc('hour', now()) - interval '14 days', now(), interval '10 minutes') t
), flower as (
  insert into readings (sensor_id, ts, moisture, temperature, light, conductivity)
  select s.id, t,
         round((case when day < 4 then 37 - 4 * day
                     when day < 10 then 45 - 4 * (day - 4)
                     else 45 - 4 * (day - 10) end)::numeric, 1),
         round((21 + 2 * sin(2 * pi() * day))::numeric, 1),
         greatest(0, round(3000 * sin(2 * pi() * (day - 0.25))))::int,
         350
  from ticks, sensors_ins s where s.type = 'flower_care'
)
insert into readings (sensor_id, ts, temperature, humidity, battery)
select s.id, t, round((20.5 + sin(2 * pi() * day))::numeric, 1), 37, 90
from ticks, sensors_ins s where s.type = 'hygrometer';
