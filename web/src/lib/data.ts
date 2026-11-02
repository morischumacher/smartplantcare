import "server-only";
import { callFunction, createClient } from "@/lib/supabase/server";
import type { HourPoint, Summary } from "@/lib/types";

// Server-side reads. All run as the signed-in user, so they belong inside <Suspense> boundaries.

export async function getSummary(): Promise<Summary> {
  return callFunction<Summary>("summary", { method: "GET" });
}

export async function getPlant(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plants")
    .select("*, pots(id, started_at, volume_l, diameter_cm, height_cm, soil_type, notes), plant_sensors(sensor_id)")
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
    .select("id, name, humidity_min, humidity_max, photo_paths, floor_plan")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getSensors() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sensors")
    .select("id, mac, type, name, room_id, last_seen_at, last_battery, last_rssi, plant_sensors(plant_id)")
    .order("type")
    .order("name", { nullsFirst: false });
  if (error) throw error;
  return data;
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
