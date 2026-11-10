// Compact, read-only overview for all clients (web app, Scriptable widget, Garmin glance).
//
// GET /functions/v1/summary            full overview (web app)
// GET /functions/v1/summary?view=compact   slim list for the Scriptable widget and the Garmin glance
// GET /functions/v1/summary?view=plant&id=…  one plant with a 7-day moisture history (Garmin detail)
// GET /functions/v1/summary?view=room&id=…   one room with its last 24 hours of climate (Garmin)
// Header: x-read-token: <SUMMARY_TOKEN>   (widget, Garmin)
//    or: Authorization: Bearer <user access token>   (web app)
//
// Per room: current climate from its hygrometer. Per plant: current values, watering status,
// recommended amount, forecast, what was learned, unconfirmed waterings, hints and photo requests.

import { createClient } from "npm:@supabase/supabase-js@2";
import { secretsMatch } from "../ingest/validate.ts";
import { climateAlerts, plantTemperatureHint } from "../_shared/climate.ts";
import { compactSummary } from "../_shared/compact.ts";
import { plantDetail, roomDetail } from "../_shared/detail.ts";
import { type HourPoint, type PlantInput, type PlantSummary, type Pot, type PotPeriod, potVolumeL, summarize } from "../_shared/watering.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const SUMMARY_TOKEN = Deno.env.get("SUMMARY_TOKEN") ?? "";

const DAY = 86_400_000;
const CURRENT_WINDOW = 60 * DAY;
const PREVIOUS_WINDOW = 120 * DAY;
const STALE_AFTER = 3 * 3_600_000;
const PHOTO_FINDINGS_DAYS = 14;
const STATUS_ORDER: Record<string, number> = { water_now: 0, water_soon: 1, no_data: 2, ok: 3 };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

const ms = (ts: string) => Date.parse(ts);
const iso = (t: number | null) => (t === null ? null : new Date(t).toISOString());
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

async function query<T>(promise: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw error;
  return data as T;
}

/** Average of the daily maximum light over the last 7 full and partial days (lux). */
function dailyPeakLight(hourly: { hour: string; light: number | null }[], now: number): number | null {
  const peaks = new Map<string, number>();
  for (const h of hourly) {
    if (h.light === null || ms(h.hour) < now - 7 * DAY) continue;
    const day = h.hour.slice(0, 10);
    peaks.set(day, Math.max(peaks.get(day) ?? 0, Number(h.light)));
  }
  if (peaks.size === 0) return null;
  return Math.round([...peaks.values()].reduce((s, v) => s + v, 0) / peaks.size);
}

function climateStatus(humidity: number | null, min: number, max: number) {
  if (humidity === null) return "no_data";
  if (humidity < min) return "too_dry";
  if (humidity > max) return "too_humid";
  return "ok";
}

// Hourly moisture and waterings per plant, kept aside for the plant detail view.
type History = Map<string, { series: HourPoint[]; waterings: { ts: number }[] }>;

async function buildSummary(now: number, history: History = new Map()) {
  const [rooms, plants, pots, links, latest, photos] = await Promise.all([
    query(supabase.from("rooms").select("id, name, humidity_min, humidity_max, floor_plan").order("name")),
    query(supabase.from("plants").select("id, name, species, room_id, moisture_min, moisture_max, temp_min_c, temp_max_c, photo_interval_days, created_at, map_x, map_y, map_height_m").is("archived_at", null).order("name")),
    query(supabase.from("pots").select("plant_id, started_at, volume_l, diameter_cm, soil_type").order("started_at", { ascending: false })),
    query(supabase.from("plant_sensors").select("plant_id, sensor_id")),
    query(supabase.from("sensor_latest").select("sensor_id, type, room_id, ts, moisture, temperature, light, conductivity, humidity")),
    query(supabase.from("plant_photos").select("plant_id, taken_at, analysis").order("taken_at", { ascending: false })),
  ]);

  const latestBySensor = new Map(latest.map((r) => [r.sensor_id, r]));

  const plantSummaries = await Promise.all(plants.map(async (plant) => {
    const plantPots = pots.filter((p) => p.plant_id === plant.id);
    const toPot = (p: (typeof pots)[number] | undefined, fallbackStart: number): Pot => ({
      started_at: p ? ms(p.started_at) : fallbackStart,
      volume_l: p ? potVolumeL(num(p.volume_l), num(p.diameter_cm)) : null,
      soil_type: p?.soil_type ?? "universal",
    });
    const currentPot = toPot(plantPots[0], ms(plant.created_at));
    const previousPot = plantPots[1] ? toPot(plantPots[1], 0) : null;

    const currentFrom = Math.max(currentPot.started_at, now - CURRENT_WINDOW);
    const from = previousPot ? Math.max(previousPot.started_at, currentPot.started_at - PREVIOUS_WINDOW) : currentFrom;

    const [hourly, waterings] = await Promise.all([
      query(supabase.rpc("plant_hourly", { p_plant_id: plant.id, p_since: new Date(from).toISOString() })),
      query(supabase.from("waterings").select("ts, amount_ml, during_vacation").eq("plant_id", plant.id).gte("ts", new Date(from).toISOString())),
    ]) as [{ hour: string; moisture: number | null; light: number | null }[], { ts: string; amount_ml: number; during_vacation: boolean }[]];

    const series: HourPoint[] = hourly.map((h) => ({ hour: ms(h.hour), moisture: num(h.moisture) }));
    const ws = waterings.map((w) => ({ ts: ms(w.ts), amount_ml: w.amount_ml, during_vacation: w.during_vacation }));
    history.set(plant.id, { series, waterings: ws });
    const lastWatering = ws.reduce<(typeof ws)[number] | null>((a, w) => (a && a.ts > w.ts ? a : w), null);
    const slice = (a: number, b: number): Pick<PotPeriod, "series" | "waterings"> => ({
      series: series.filter((p) => p.hour >= a && p.hour < b),
      waterings: ws.filter((w) => w.ts >= a && w.ts < b),
    });

    // Current values: average over the plant's sensors with a recent reading.
    const sensorRows = links
      .filter((l) => l.plant_id === plant.id)
      .map((l) => latestBySensor.get(l.sensor_id))
      .filter((r) => r && now - ms(r.ts) <= STALE_AFTER);
    const avg = (field: "moisture" | "temperature" | "light" | "conductivity") => {
      const values = sensorRows.map((r) => num(r![field])).filter((v): v is number => v !== null);
      return values.length ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10 : null;
    };
    const moisture = avg("moisture");
    const lastPhoto = photos.find((x) => x.plant_id === plant.id);

    const input: PlantInput = {
      moisture_min: Number(plant.moisture_min),
      moisture_max: Number(plant.moisture_max),
      photo_interval_days: plant.photo_interval_days,
      current: { pot: currentPot, ...slice(currentFrom, Infinity) },
      previous: previousPot ? { pot: previousPot, ...slice(from, currentPot.started_at) } : null,
      latest_moisture: moisture === null ? null : { value: moisture, ts: Math.max(...sensorRows.map((r) => ms(r!.ts))) },
      last_photo_at: lastPhoto ? ms(lastPhoto.taken_at) : null,
      now,
    };
    const s: PlantSummary = summarize(input);

    // Findings of the AI photo check, while the photo is recent.
    const analysis = lastPhoto?.analysis as { health?: string; summary?: string } | null;
    if (analysis?.summary && analysis.health !== "good" && now - ms(lastPhoto!.taken_at) <= PHOTO_FINDINGS_DAYS * DAY) {
      s.hints.push({
        code: "photo_findings",
        severity: analysis.health === "poor" ? "warning" : "info",
        message: `Foto-Check: ${analysis.summary}`,
      });
    }

    return {
      id: plant.id,
      name: plant.name,
      species: plant.species,
      room_id: plant.room_id,
      map: plant.map_x === null
        ? null
        : { x: Number(plant.map_x), y: Number(plant.map_y), h: plant.map_height_m === null ? null : Number(plant.map_height_m) },
      moisture: s.moisture,
      temperature: avg("temperature"),
      light: avg("light"),
      conductivity: avg("conductivity"),
      light_peak_7d: dailyPeakLight(hourly, now),
      target: { min: input.moisture_min, max: input.moisture_max },
      temp_target: { min: num(plant.temp_min_c), max: num(plant.temp_max_c) },
      status: s.status,
      recommended_ml: s.recommended_ml,
      next_watering_at: iso(s.next_watering_at),
      last_watering: lastWatering ? { ts: iso(lastWatering.ts)!, amount_ml: lastWatering.amount_ml } : null,
      learning: { ...s.learning, pot_since: iso(s.learning.pot_since) },
      pending_waterings: s.pending_waterings.map((r) => ({ ...r, ts: iso(r.ts) })),
      hints: s.hints,
      photo_request: s.photo_request,
    };
  }));

  plantSummaries.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name));

  type RoomEntry = {
    id: string | null;
    name: string;
    climate: {
      temperature: number | null;
      humidity: number | null;
      status: string;
      target: { min: number; max: number };
      [k: string]: unknown;
    } | null;
    floor_plan: unknown;
    plants: typeof plantSummaries;
  };
  const roomEntries: RoomEntry[] = rooms.map((room) => {
    const hygro = latest.find((r) => r.type === "hygrometer" && r.room_id === room.id && now - ms(r.ts) <= STALE_AFTER);
    const humidity = hygro ? num(hygro.humidity) : null;
    return {
      id: room.id,
      name: room.name,
      climate: {
        temperature: hygro ? num(hygro.temperature) : null,
        humidity,
        target: { min: Number(room.humidity_min), max: Number(room.humidity_max) },
        status: climateStatus(humidity, Number(room.humidity_min), Number(room.humidity_max)),
        ts: hygro ? hygro.ts : null,
      },
      floor_plan: room.floor_plan,
      plants: plantSummaries.filter((p) => p.room_id === room.id),
    };
  });
  const unassigned = plantSummaries.filter((p) => !p.room_id || !rooms.some((r) => r.id === p.room_id));
  if (unassigned.length > 0) roomEntries.push({ id: null, name: "Ohne Raum", climate: null, floor_plan: null, plants: unassigned });

  const alerts = climateAlerts(roomEntries.filter((r) => r.climate).map((r) => {
    const temps = r.plants.map((p) => p.temperature).filter((v): v is number => v !== null);
    return {
      name: r.name,
      humidity: r.climate!.humidity,
      humidity_min: Number(r.climate!.target.min),
      humidity_max: Number(r.climate!.target.max),
      temperature: r.climate!.temperature ?? (temps.length ? temps.reduce((s, v) => s + v, 0) / temps.length : null),
      plant_targets: r.plants.map((p) => ({ temp_min_c: p.temp_target.min, temp_max_c: p.temp_target.max })),
    };
  }));

  // Temperature at each plant's own sensor, unless its room already reports the same problem.
  for (const r of roomEntries) {
    const roomAlert = alerts.find((a) => a.room === r.name && a.kind === "temperature")?.direction ?? null;
    for (const p of r.plants) {
      const hint = plantTemperatureHint(
        { temperature: p.temperature, temp_min_c: p.temp_target.min, temp_max_c: p.temp_target.max },
        r.climate ? roomAlert : null,
      );
      if (hint) p.hints.push(hint);
    }
  }

  return {
    generated_at: iso(now),
    alerts,
    attention: plantSummaries.filter((p) => p.status === "water_now" || p.status === "water_soon").length,
    rooms: roomEntries,
  };
}

// Widget and Garmin send the read token; the web app sends the signed-in user's access token.
async function authorized(req: Request): Promise<boolean> {
  if (secretsMatch(req.headers.get("x-read-token"), SUMMARY_TOKEN)) return true;
  const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!token) return false;
  const { data } = await supabase.auth.getUser(token);
  return Boolean(data?.user);
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return json(405, { error: "method not allowed" });
  if (!(await authorized(req))) return json(401, { error: "unauthorized" });
  try {
    const params = new URL(req.url).searchParams;
    const view = params.get("view");
    const id = params.get("id");
    const now = Date.now();
    const history: History = new Map();
    const summary = await buildSummary(now, history);
    if (view === "compact") return json(200, compactSummary(summary, now));
    if (view === "plant") {
      const plant = summary.rooms.flatMap((r) => r.plants).find((p) => p.id === id);
      if (!plant) return json(404, { error: "plant not found" });
      const h = history.get(plant.id)!;
      return json(200, plantDetail(plant, h.series.map((x) => ({ ts: x.hour, moisture: x.moisture })), h.waterings, now));
    }
    if (view === "room") {
      const room = summary.rooms.find((r) => r.id === id);
      if (!room) return json(404, { error: "room not found" });
      const readings = await query(
        supabase.from("readings").select("ts, humidity, temperature, sensors!inner(type, room_id)")
          .eq("sensors.type", "hygrometer").eq("sensors.room_id", id)
          .gte("ts", new Date(now - 25 * 3_600_000).toISOString()),
      ) as { ts: string; humidity: number | null; temperature: number | null }[];
      return json(200, roomDetail(room, readings.map((r) => ({ ts: ms(r.ts), humidity: num(r.humidity), temperature: num(r.temperature) })), now));
    }
    return json(200, summary);
  } catch (e) {
    console.error("summary failed", e);
    return json(500, { error: "database error" });
  }
});
