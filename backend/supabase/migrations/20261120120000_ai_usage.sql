-- One row per Claude call (photo check, species ID, room plan): tokens in and out, cache use,
-- and the visual tokens of the images sent, so the web app can show AI costs and what the
-- smaller AI copies of photos save. Written by Edge Functions (service role), read by the web app.
create table ai_usage (
  id                  bigint generated always as identity primary key,
  created_at          timestamptz not null default now(),
  function            text not null,               -- e.g. 'analyze-photo', 'plant-species:identify', 'plan-room'
  model               text not null,
  input_tokens        integer not null default 0,  -- billed input incl. images, excl. cache reads/writes
  output_tokens       integer not null default 0,  -- incl. thinking
  cache_read_tokens   integer not null default 0,
  cache_write_tokens  integer not null default 0,
  image_count         integer not null default 0,
  image_tokens        integer,                     -- visual tokens of the images sent (estimated from their size)
  image_tokens_full   integer                      -- what the full-size display photos would have cost
);
create index on ai_usage (created_at desc);

alter table ai_usage enable row level security;
create policy "authenticated read" on ai_usage for select to authenticated using (true);
grant select on ai_usage to authenticated;
grant all on ai_usage to service_role;
grant usage, select on sequence ai_usage_id_seq to service_role;
