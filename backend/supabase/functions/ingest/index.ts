// Receives sensor readings from the ESPHome gateway (Atom Lite).
//
// POST /functions/v1/ingest
// Header: x-device-secret: <INGEST_SECRET>
// Body:   { "readings": [ { "mac": "C4:7C:8D:..", "type": "flower_care", "moisture": 23, ... } ] }
//         or a single reading object.
//
// Unknown MACs are registered as new sensors so they show up in the database for assignment.
// Sensors on the ignore list (ignored_at set) are not re-registered and their readings are dropped.

import { createClient } from "npm:@supabase/supabase-js@2";
import { type Reading, secretsMatch, validatePayload } from "./validate.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const INGEST_SECRET = Deno.env.get("INGEST_SECRET") ?? "";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function resolveSensorIds(
  readings: Reading[],
): Promise<{ ids: Map<string, string>; ignored: Map<string, string>; errors: string[] }> {
  const typeByMac = new Map(readings.map((r) => [r.mac, r.type]));
  const macs = [...typeByMac.keys()];

  const { data: existing, error } = await supabase
    .from("sensors")
    .select("id, mac, type, ignored_at")
    .in("mac", macs);
  if (error) throw error;

  const ids = new Map<string, string>();
  const ignored = new Map<string, string>();
  const errors: string[] = [];
  for (const s of existing) {
    if (s.ignored_at) {
      ignored.set(s.mac, s.id);
    } else if (s.type !== typeByMac.get(s.mac)) {
      errors.push(`${s.mac}: registered as ${s.type}, got ${typeByMac.get(s.mac)}`);
    } else {
      ids.set(s.mac, s.id);
    }
  }

  const known = new Set(existing.map((s) => s.mac));
  const missing = macs.filter((m) => !known.has(m)).map((mac) => ({ mac, type: typeByMac.get(mac)! }));
  if (missing.length > 0) {
    // ignoreDuplicates handles a concurrent request registering the same MAC.
    const { error: insertError } = await supabase
      .from("sensors")
      .upsert(missing, { onConflict: "mac", ignoreDuplicates: true });
    if (insertError) throw insertError;
    const { data: created, error: reloadError } = await supabase
      .from("sensors")
      .select("id, mac")
      .in("mac", missing.map((m) => m.mac));
    if (reloadError) throw reloadError;
    for (const s of created) ids.set(s.mac, s.id);
  }

  return { ids, ignored, errors };
}

async function updateLastSeen(readings: Reading[], ids: Map<string, string>): Promise<void> {
  // Keep only the newest reading per sensor.
  const latest = new Map<string, Reading>();
  for (const r of readings) latest.set(r.mac, r);

  const now = new Date().toISOString();
  await Promise.all([...latest.values()].filter((r) => ids.has(r.mac)).map((r) => {
    const update: Record<string, unknown> = { last_seen_at: r.ts ?? now };
    if (r.rssi !== null) update.last_rssi = r.rssi;
    if (r.battery !== null) update.last_battery = r.battery;
    return supabase.from("sensors").update(update).eq("id", ids.get(r.mac)!);
  }));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  if (!secretsMatch(req.headers.get("x-device-secret"), INGEST_SECRET)) {
    return json(401, { error: "unauthorized" });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid JSON" });
  }

  const { readings, errors } = validatePayload(body);
  if (readings.length === 0) return json(400, { inserted: 0, errors });

  try {
    const { ids, ignored, errors: sensorErrors } = await resolveSensorIds(readings);
    errors.push(...sensorErrors);

    // Always set ts explicitly: in a bulk insert, rows missing a column get null, not the default.
    const now = new Date().toISOString();
    const rows = readings
      .filter((r) => ids.has(r.mac))
      .map(({ mac, type: _type, ts, ...values }) => ({
        sensor_id: ids.get(mac)!,
        ts: ts ?? now,
        ...values,
      }));

    if (rows.length > 0) {
      const { error } = await supabase.from("readings").insert(rows);
      if (error) throw error;
    }
    // ignored sensors still get last_seen_at, so the ignore list shows whether they are still around
    await updateLastSeen(readings, new Map([...ids, ...ignored]));

    // readings from ignored sensors only are fine, not a bad request
    const ok = rows.length > 0 || ignored.size > 0;
    return json(ok ? 200 : 400, { inserted: rows.length, ignored: ignored.size, errors });
  } catch (e) {
    console.error("ingest failed", e);
    return json(500, { error: "database error" });
  }
});
