-- sensor_latest took the newest reading row as a whole. Flower Care sends its values in separate
-- packets, so two uploads in quick succession (button press next to the regular upload) can leave
-- a newest row with only light or only conductivity – and the plant showed "no readings".
-- Now: id/ts/battery/rssi from the newest row, each measurement from the newest row that has it,
-- at most one hour older than the newest row.
create or replace view sensor_latest with (security_invoker = true) as
select
  s.mac, s.type, s.name, s.room_id,
  r.id, r.sensor_id, r.ts,
  (select x.moisture from readings x where x.sensor_id = r.sensor_id and x.moisture is not null and x.ts >= r.ts - interval '1 hour' order by x.ts desc limit 1) as moisture,
  (select x.temperature from readings x where x.sensor_id = r.sensor_id and x.temperature is not null and x.ts >= r.ts - interval '1 hour' order by x.ts desc limit 1) as temperature,
  (select x.light from readings x where x.sensor_id = r.sensor_id and x.light is not null and x.ts >= r.ts - interval '1 hour' order by x.ts desc limit 1) as light,
  (select x.conductivity from readings x where x.sensor_id = r.sensor_id and x.conductivity is not null and x.ts >= r.ts - interval '1 hour' order by x.ts desc limit 1) as conductivity,
  (select x.humidity from readings x where x.sensor_id = r.sensor_id and x.humidity is not null and x.ts >= r.ts - interval '1 hour' order by x.ts desc limit 1) as humidity,
  r.battery, r.rssi
from (select distinct on (sensor_id) * from readings order by sensor_id, ts desc) r
join sensors s on s.id = r.sensor_id;
