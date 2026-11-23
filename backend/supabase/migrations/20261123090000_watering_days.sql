-- Watering routine: fixed weekdays (ISO 1 = Monday … 7 = Sunday) on which plants are watered
-- together. Empty = every plant on its own day, as before.
create table care_settings (
  id             boolean primary key default true check (id),
  watering_days  smallint[] not null default '{}' check (watering_days <@ array[1,2,3,4,5,6,7]::smallint[]),
  updated_at     timestamptz not null default now()
);
insert into care_settings default values;

alter table care_settings enable row level security;
create policy "authenticated full access" on care_settings for all to authenticated using (true) with check (true);
grant all on care_settings to authenticated, service_role;
