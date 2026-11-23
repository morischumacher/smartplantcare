import "server-only";
import { callFunction, createClient } from "@/lib/supabase/server";
import type { Candidate, HourPoint, Species, Summary } from "@/lib/types";
import type { UsageRow } from "@/lib/ai-cost";

// Server-side reads. All run as the signed-in user, so they belong inside <Suspense> boundaries.

export async function getSummary(): Promise<Summary> {
  return callFunction<Summary>("summary", { method: "GET" });
}

export async function getPlant(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plants")
    .select("*, pots(id, started_at, volume_l, diameter_cm, height_cm, soil_type, notes), plant_sensors(sensor_id, sensors(last_seen_at))")
    .eq("id", id)
    .order("started_at", { referencedTable: "pots", ascending: false })
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getHourly(plantId: string, days: number): Promise<HourPoint[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase.rpc("plant_hourly", { p_plant_id: plantId, p_since: since });
  if (error) throw error;
  return (data ?? []) as HourPoint[];
}

export async function getWaterings(plantId: string, limit = 20) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("waterings")
    .select("id, ts, amount_ml, source, during_vacation")
    .eq("plant_id", plantId)
    .order("ts", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export type PhotoAnalysis = {
  health: "good" | "fair" | "poor";
  summary: string;
  issues: { type: string; severity: "low" | "medium" | "high"; description: string }[];
  watering_assessment: string;
  light_assessment: string;
  growth_vs_previous: string;
  recommendations: string[];
  species_guess: string | null;
};

export type Photo = {
  id: string;
  taken_at: string;
  reason: string | null;
  url: string | null;
  analysis: PhotoAnalysis | null;
};

export async function getPhotos(plantId: string): Promise<Photo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plant_photos")
    .select("id, taken_at, reason, storage_path, analysis")
    .eq("plant_id", plantId)
    .order("taken_at", { ascending: false })
    .limit(24);
  if (error) throw error;
  const urls = await signedUrls(data.map((p) => p.storage_path));
  return data.map((p) => ({
    id: p.id,
    taken_at: p.taken_at,
    reason: p.reason,
    url: urls.get(p.storage_path) ?? null,
    analysis: p.analysis as PhotoAnalysis | null,
  }));
}

export async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.storage.from("plant-photos").createSignedUrls(paths, 3600);
  const map = new Map<string, string>();
  for (const d of data ?? []) if (d.path && d.signedUrl) map.set(d.path, d.signedUrl);
  return map;
}

export async function getRooms() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rooms")
    .select("id, name, humidity_min, humidity_max, photo_paths, floor_plan")
    .order("name");
  if (error) throw error;
  return data;
}

export async function getRoom(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rooms")
    .select("id, name, humidity_min, humidity_max, photo_paths, floor_plan, scan_path, scan_plan")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Sensors in use; the ones on the ignore list come from getIgnoredSensors. */
export async function getSensors() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sensors")
    .select("id, mac, type, name, room_id, last_seen_at, last_battery, last_rssi, plant_sensors(plant_id, plants(name))")
    .is("ignored_at", null)
    .order("type")
    .order("name", { nullsFirst: false });
  if (error) throw error;
  return data;
}

/** null while the notifications migration is not deployed yet */
export async function getIgnoredSensors() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sensors")
    .select("id, mac, type, name, last_seen_at, last_rssi, ignored_at")
    .not("ignored_at", "is", null)
    .order("ignored_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getArchivedPlants() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plants")
    .select("id, name, species, archived_at")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getNotifySettings() {
  const supabase = await createClient();
  const { data } = await supabase.from("notify_settings").select("ntfy_topic, quiet_from, quiet_to").maybeSingle();
  return data as { ntfy_topic: string | null; quiet_from: number | null; quiet_to: number | null } | null;
}

export async function getCareSettings() {
  const supabase = await createClient();
  const { data } = await supabase.from("care_settings").select("watering_days").maybeSingle();
  return data as { watering_days: number[] } | null;
}

export async function getVacations() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vacations")
    .select("id, starts_on, ends_on, notes")
    .gte("ends_on", new Date().toISOString().slice(0, 10))
    .order("starts_on");
  if (error) throw error;
  return data;
}

export async function getSpeciesList(): Promise<Species[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("species").select("*").order("common_name_de");
  if (error) throw error;
  return data as Species[];
}

export async function getSpecies(id: string): Promise<Species | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("species").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Species | null;
}

export async function getCandidates(roomId: string): Promise<Candidate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plant_candidates")
    .select("id, description, species_guess, species_id, confidence, map_x, map_y, map_height_m, box, photo_path, closeup_path, species(common_name_de)")
    .eq("room_id", roomId)
    .eq("status", "open")
    .order("created_at");
  if (error) throw error;
  const urls = await signedUrls(data.flatMap((c) => [c.photo_path, c.closeup_path].filter((p): p is string => Boolean(p))));
  return data.map((c) => ({
    id: c.id,
    description: c.description,
    species_guess: c.species_guess,
    species_id: c.species_id,
    label: (c.species as unknown as { common_name_de: string } | null)?.common_name_de ?? c.species_guess ?? "?",
    confidence: c.confidence,
    map_x: c.map_x === null ? null : Number(c.map_x),
    map_y: c.map_y === null ? null : Number(c.map_y),
    map_height_m: c.map_height_m === null ? null : Number(c.map_height_m),
    box: c.box,
    photo_url: c.photo_path ? (urls.get(c.photo_path) ?? null) : null,
    closeup_url: c.closeup_path ? (urls.get(c.closeup_path) ?? null) : null,
  }));
}

/** Claude calls of the last `days` days, newest first (written by the Edge Functions). */
export async function getAiUsage(days = 30): Promise<UsageRow[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("ai_usage")
    .select("created_at, function, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, image_count, image_tokens, image_tokens_full")
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as UsageRow[];
}
