-- Push notifications via ntfy: settings (topic, quiet hours), what was sent when, and the cron job
-- that calls the `notify` Edge Function every 15 minutes.

-- One row of settings, edited in the web app.
create table notify_settings (
  id          boolean primary key default true check (id),
  ntfy_topic  text,                                      -- null = notifications off
  quiet_from  smallint default 22 check (quiet_from between 0 and 23),  -- Berlin time
  quiet_to    smallint default 8 check (quiet_to between 0 and 23),
  web_url     text not null default 'https://smartplantcare-umber.vercel.app',
  updated_at  timestamptz not null default now()
);
insert into notify_settings default values;

-- Per event key ("water:<plant id>", "climate:<room>:humidity", …): active at the last run and when
-- it was last sent. Lets `notify` send new events once and remind daily instead of every run.
create table notification_state (
  key           text primary key,
  active        boolean not null default true,
  last_sent_at  timestamptz
);

-- Secrets only the database and Edge Functions (service role) can read; generated here, so nothing
-- has to be set by hand.
create table internal_secrets (
  name   text primary key,
  value  text not null
);
insert into internal_secrets (name, value)
values ('notify_cron', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));

alter table notify_settings enable row level security;
alter table notification_state enable row level security;
alter table internal_secrets enable row level security;
create policy "authenticated full access" on notify_settings for all to authenticated using (true) with check (true);
create policy "authenticated read" on notification_state for select to authenticated using (true);
revoke all on internal_secrets from anon, authenticated;
grant all on notify_settings, notification_state to authenticated, service_role;
grant all on internal_secrets to service_role;

-- Every 15 minutes: POST to `notify` with the generated secret.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'notify',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://zvymcgkkjrfxqoartwrp.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.internal_secrets where name = 'notify_cron')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
