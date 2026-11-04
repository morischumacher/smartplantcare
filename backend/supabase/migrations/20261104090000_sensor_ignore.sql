-- Ignore list for sensors that are not ours (e.g. a neighbour's Flower Care in Bluetooth range).
-- ingest drops readings of ignored sensors and no longer re-registers them; the web app lists them
-- separately so they can be taken back.
alter table sensors add column ignored_at timestamptz;

comment on column sensors.ignored_at is 'set when the user put the sensor on the ignore list; null = in use';
