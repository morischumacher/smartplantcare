-- Pot periods (repotting resets learning), watering source, plant photos, hourly aggregation.

-- Each repotting starts a new pot period. Learning only uses data from the current period;
-- the previous period's learned values, scaled by pot volume, serve as the starting estimate.
create table pots (
  id           uuid primary key default gen_random_uuid(),
  plant_id     uuid not null references plants (id) on delete cascade,
  started_at   timestamptz not null default now(),
  volume_l     numeric(5,2) check (volume_l > 0),
  diameter_cm  numeric(5,1) check (diameter_cm > 0),
  height_cm    numeric(5,1) check (height_cm > 0),
  soil_type    text not null default 'universal'
               check (soil_type in ('universal', 'cactus', 'orchid', 'herb', 'peat_free', 'other')),
  notes        text,
  created_at   timestamptz not null default now()
);
create index on pots (plant_id, started_at desc);

-- Move pot data off plants (no production data yet, so a plain move is enough).
insert into pots (plant_id, started_at, volume_l, diameter_cm, height_cm)
select id, created_at, pot_volume_l, pot_diameter_cm, pot_height_cm
from plants
where pot_volume_l is not null or pot_diameter_cm is not null;

alter table plants
  drop column pot_volume_l,
  drop column pot_diameter_cm,
  drop column pot_height_cm,
  add column photo_interval_days integer not null default 14 check (photo_interval_days > 0);

-- 'manual' = logged by the user; 'detected' = a moisture jump the user confirmed with an amount.
alter table waterings
  add column source text not null default 'manual' check (source in ('manual', 'detected'));

create table plant_photos (
  id            uuid primary key default gen_random_uuid(),
  plant_id      uuid not null references plants (id) on delete cascade,
  taken_at      timestamptz not null default now(),
  storage_path  text not null unique,   -- object path in the plant-photos bucket
  reason        text check (reason in ('scheduled', 'anomaly', 'season', 'repot', 'manual')),
  notes         text,
  analysis      jsonb,                  -- reserved for an optional AI health check
  created_at    timestamptz not null default now()
);
create index on plant_photos (plant_id, taken_at desc);

alter table pots enable row level security;
alter table plant_photos enable row level security;
create policy "authenticated full access" on pots for all to authenticated using (true) with check (true);
create policy "authenticated full access" on plant_photos for all to authenticated using (true) with check (true);
grant all on pots, plant_photos to authenticated, service_role;

-- Private bucket for plant photos.
insert into storage.buckets (id, name, public)
values ('plant-photos', 'plant-photos', false)
on conflict (id) do nothing;

create policy "authenticated access to plant photos" on storage.objects
  for all to authenticated
  using (bucket_id = 'plant-photos')
  with check (bucket_id = 'plant-photos');

-- Hourly averages over all sensors of a plant, used by the watering logic.
-- Returns one JSON array instead of rows, because the API caps responses at 1000 rows
-- and 60 days are 1440 hours.
create function plant_hourly(p_plant_id uuid, p_since timestamptz)
returns jsonb
language sql stable security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(h order by h.hour), '[]'::jsonb)
  from (
    select date_trunc('hour', r.ts) as hour,
           round(avg(r.moisture), 1) as moisture,
           round(avg(r.temperature), 1) as temperature,
           round(avg(r.light)) as light,
           round(avg(r.conductivity)) as conductivity
    from readings r
    join plant_sensors ps on ps.sensor_id = r.sensor_id
    where ps.plant_id = p_plant_id
      and r.ts >= p_since
    group by 1
  ) h;
$$;

grant execute on function plant_hourly(uuid, timestamptz) to authenticated, service_role;
