// Push notifications via ntfy, called every 15 minutes by pg_cron (see migration *_notifications).
//
// POST /functions/v1/notify
// Header: x-cron-secret: <internal_secrets.notify_cron>
//
// Reads the full summary (same logic as widget and web app), collects events (water now, plant
// warnings, climate alerts, silent sensors), decides what is new or due again and publishes it to
// the ntfy topic from `notify_settings`. Quiet hours and vacations hold back all but critical events.

import { createClient } from "npm:@supabase/supabase-js@2";
import { secretsMatch } from "../ingest/validate.ts";
import { collectEvents, decide, inQuietHours, type NotifyEvent, type NotifyInput } from "../_shared/notify.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SUMMARY_TOKEN = Deno.env.get("SUMMARY_TOKEN") ?? "";
const NTFY_SERVER = "https://ntfy.sh";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function query<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

async function publish(topic: string, webUrl: string, e: NotifyEvent): Promise<boolean> {
  const res = await fetch(NTFY_SERVER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, title: e.title, message: e.message, priority: e.priority, tags: e.tags, click: webUrl + e.path }),
  });
  if (!res.ok) console.error("ntfy failed", res.status, await res.text());
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  const secret = await query(supabase.from("internal_secrets").select("value").eq("name", "notify_cron").maybeSingle());
  if (!secretsMatch(req.headers.get("x-cron-secret"), (secret as { value: string } | null)?.value ?? "")) {
    return json(401, { error: "unauthorized" });
  }

  try {
    const now = Date.now();
    const settings = await query(supabase.from("notify_settings").select("ntfy_topic, quiet_from, quiet_to, web_url").maybeSingle()) as
      { ntfy_topic: string | null; quiet_from: number | null; quiet_to: number | null; web_url: string } | null;
    if (!settings?.ntfy_topic) return json(200, { sent: 0, reason: "no topic" });

    const res = await fetch(`${SUPABASE_URL}/functions/v1/summary`, { headers: { "x-read-token": SUMMARY_TOKEN } });
    if (!res.ok) throw new Error(`summary ${res.status}`);
    const summary = await res.json() as NotifyInput;

    const today = new Date(now).toISOString().slice(0, 10);
    const [sensors, links, vacations, state] = await Promise.all([
      query(supabase.from("sensors").select("id, name, mac, room_id, last_seen_at")),
      query(supabase.from("plant_sensors").select("sensor_id")),
      query(supabase.from("vacations").select("id").lte("starts_on", today).gte("ends_on", today)),
      query(supabase.from("notification_state").select("key, active, last_sent_at")),
    ]) as [
      { id: string; name: string | null; mac: string; room_id: string | null; last_seen_at: string | null }[],
      { sensor_id: string }[],
      { id: string }[],
      { key: string; active: boolean; last_sent_at: string | null }[],
    ];
    const linked = new Set(links.map((l) => l.sensor_id));

    const events = collectEvents(
      summary,
      sensors.map((s) => ({ ...s, in_use: linked.has(s.id) || s.room_id !== null })),
      now,
    );
    const result = decide(events, state, {
      now,
      quiet: inQuietHours(now, settings.quiet_from, settings.quiet_to),
      vacation: vacations.length > 0,
    });

    // Only events ntfy accepted count as sent; the others stay due for the next run.
    const failed = new Set<string>();
    for (const e of result.send) {
      if (!(await publish(settings.ntfy_topic, settings.web_url.replace(/\/$/, ""), e))) failed.add(e.key);
    }
    const prev = new Map(state.map((s) => [s.key, s.last_sent_at]));
    const rows = result.state.map((s) => (failed.has(s.key) ? { ...s, last_sent_at: prev.get(s.key) ?? null } : s));
    if (rows.length > 0) await query(supabase.from("notification_state").upsert(rows));

    return json(200, { events: events.length, sent: result.send.length - failed.size, failed: failed.size });
  } catch (e) {
    console.error("notify failed", e);
    return json(500, { error: "notify failed" });
  }
});
