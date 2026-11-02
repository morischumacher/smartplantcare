-- Initial schema: rooms, sensors, plants, readings, waterings, vacations.
-- All timestamps are UTC (timestamptz). Units are encoded in column names where not obvious.

create type sensor_type as enum ('flower_care', 'hygrometer');

-- A room groups plants and shares one hygrometer's climate values.
create table rooms (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  humidity_min  numeric(4,1) not null default 40,   -- %
  humidity_max  numeric(4,1) not null default 60,   -- %
  notes         text,
  created_at    timestamptz not null default now(),
  check (humidity_min < humidity_max)
);

-- One physical BLE sensor, identified by MAC. Unknown MACs are auto-created by `ingest`.
create table sensors (
  id            uuid primary key default gen_random_uuid(),
  mac           text not null unique check (mac ~ '^([0-9A-F]{2}:){5}[0-9A-F]{2}$'),
  type          sensor_type not null,
  name          text,
  room_id       uuid references rooms (id) on delete set null,
  last_seen_at  timestamptz,
  last_battery  smallint,      -- %, null if the sensor doesn't report it (HHCCJCY01 fw 3.2.1+)
  last_rssi     smallint,      -- dBm
  created_at    timestamptz not null default now()
);

create table plants (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  species            text,                         -- later: FK to a species/template table
  room_id            uuid references rooms (id) on delete set null,
  pot_volume_l       numeric(5,2) check (pot_volume_l > 0),
  pot_diameter_cm    numeric(5,1) check (pot_diameter_cm > 0),
  pot_height_cm      numeric(5,1) check (pot_height_cm > 0),
  moisture_min       numeric(4,1) not null default 20,   -- %
  moisture_max       numeric(4,1) not null default 50,   -- %
  light_min_lux      integer,
  light_max_lux      integer,
  temp_min_c         numeric(4,1),
  temp_max_c         numeric(4,1),
  conductivity_min   integer,                      -- µS/cm
  conductivity_max   integer,                      -- µS/cm
  notes              text,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  check (moisture_min < moisture_max)
);

-- Large pots may have several sensors; their values are averaged.
create table plant_sensors (
  plant_id   uuid not null references plants (id) on delete cascade,
  sensor_id  uuid not null references sensors (id) on delete cascade,
  primary key (plant_id, sensor_id)
);
create index on plant_sensors (sensor_id);

-- Raw measurements. Flower Care fills moisture/temperature/light/conductivity,
-- hygrometers fill temperature/humidity.
create table readings (
  id            bigint generated always as identity primary key,
  sensor_id     uuid not null references sensors (id) on delete cascade,
  ts            timestamptz not null default now(),
  moisture      numeric(4,1),      -- %
  temperature   numeric(4,1),      -- °C
  light         integer,           -- lux
  conductivity  integer,           -- µS/cm
  humidity      numeric(4,1),      -- %
  battery       smallint,          -- %
  rssi          smallint           -- dBm
);
create index on readings (sensor_id, ts desc);

create table waterings (
  id               uuid primary key default gen_random_uuid(),
  plant_id         uuid not null references plants (id) on delete cascade,
  ts               timestamptz not null default now(),
  amount_ml        integer not null check (amount_ml > 0),
  moisture_before  numeric(4,1),   -- %, filled from readings when logged
  moisture_peak    numeric(4,1),   -- %, filled later by the learning job
  during_vacation  boolean not null default false,  -- excluded from learning
  notes            text
);
create index on waterings (plant_id, ts desc);

create table vacations (
  id         uuid primary key default gen_random_uuid(),
  starts_on  date not null,
  ends_on    date not null,
  notes      text,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

-- Latest reading per sensor, handy for debugging and the summary endpoint.
create view sensor_latest with (security_invoker = true) as
select distinct on (r.sensor_id)
  s.mac, s.type, s.name, s.room_id, r.*
from readings r
join sensors s on s.id = r.sensor_id
order by r.sensor_id, r.ts desc;

-- RLS: single-user app. Signed-in user may do everything; anon gets nothing.
-- Edge Functions use the service role key and bypass RLS.
do $$
declare t text;
begin
  foreach t in array array['rooms', 'sensors', 'plants', 'plant_sensors', 'readings', 'waterings', 'vacations'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "authenticated full access" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Explicit grants, so the API works regardless of the project's auto-expose setting.
-- anon gets nothing; access is still filtered by the RLS policies above.
grant usage on schema public to authenticated, service_role;
grant all on all tables in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;
