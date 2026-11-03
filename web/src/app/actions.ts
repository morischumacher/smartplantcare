"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { callFunction, createClient } from "@/lib/supabase/server";
import type { CandidateSuggestion, FloorPlan, Species } from "@/lib/types";

// Server Actions: every write goes through here and runs as the signed-in user (RLS applies).

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};
const num = (fd: FormData, key: string) => {
  const v = str(fd, key);
  if (v === null) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

function fail(e: unknown): ActionResult {
  const message = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : "Fehler";
  return { ok: false, error: message };
}

// --- Auth ------------------------------------------------------------------

export async function signIn(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: str(fd, "email") ?? "",
    password: (fd.get("password") as string) ?? "",
  });
  if (error) return { ok: false, error: "E-Mail oder Passwort falsch." };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// --- Waterings -------------------------------------------------------------

async function duringVacation(ts: Date): Promise<boolean> {
  const supabase = await createClient();
  const day = ts.toISOString().slice(0, 10);
  const { count } = await supabase
    .from("vacations")
    .select("id", { count: "exact", head: true })
    .lte("starts_on", day)
    .gte("ends_on", day);
  return (count ?? 0) > 0;
}

export async function logWatering(input: {
  plantId: string;
  amountMl: number;
  ts?: string;
  source?: "manual" | "detected";
}): Promise<ActionResult> {
  if (!Number.isFinite(input.amountMl) || input.amountMl <= 0 || input.amountMl > 20000) {
    return { ok: false, error: "Bitte eine Menge zwischen 1 und 20000 ml eingeben." };
  }
  const ts = input.ts ? new Date(input.ts) : new Date();
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("waterings").insert({
      plant_id: input.plantId,
      ts: ts.toISOString(),
      amount_ml: Math.round(input.amountMl),
      source: input.source ?? "manual",
      during_vacation: await duringVacation(ts),
    });
    if (error) throw error;
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true, message: `${Math.round(input.amountMl)} ml eingetragen` };
}

export async function deleteWatering(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("waterings").delete().eq("id", id);
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

// --- Plants ----------------------------------------------------------------

export async function savePlant(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const fields = {
    name: str(fd, "name"),
    species: str(fd, "species"),
    species_id: str(fd, "species_id"),
    room_id: str(fd, "room_id"),
    moisture_min: num(fd, "moisture_min") ?? 20,
    moisture_max: num(fd, "moisture_max") ?? 50,
    light_min_lux: num(fd, "light_min_lux"),
    light_max_lux: num(fd, "light_max_lux"),
    temp_min_c: num(fd, "temp_min_c"),
    temp_max_c: num(fd, "temp_max_c"),
    photo_interval_days: num(fd, "photo_interval_days") ?? 14,
    notes: str(fd, "notes"),
  };
  if (!fields.name) return { ok: false, error: "Bitte einen Namen eingeben." };
  if (fields.moisture_min >= fields.moisture_max) return { ok: false, error: "Feuchte: Minimum muss kleiner als Maximum sein." };
  const sensorIds = fd.getAll("sensor_ids").map(String);
  const photoPath = str(fd, "photo_path");

  let plantId = id;
  try {
    const supabase = await createClient();
    if (id) {
      const { error } = await supabase.from("plants").update(fields).eq("id", id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("plants").insert(fields).select("id").single();
      if (error) throw error;
      plantId = data.id;
      const { error: potError } = await supabase.from("pots").insert({
        plant_id: plantId,
        volume_l: num(fd, "volume_l"),
        diameter_cm: num(fd, "diameter_cm"),
        height_cm: num(fd, "height_cm"),
        soil_type: str(fd, "soil_type") ?? "universal",
      });
      if (potError) throw potError;
    }
    // photo used to identify the species becomes the first diary photo
    if (photoPath) await supabase.from("plant_photos").insert({ plant_id: plantId, storage_path: photoPath, reason: "manual" });
    const { error: delError } = await supabase.from("plant_sensors").delete().eq("plant_id", plantId!);
    if (delError) throw delError;
    if (sensorIds.length > 0) {
      // a sensor sits in one pot: assigning it here takes it away from any other plant
      const { error: moveError } = await supabase.from("plant_sensors").delete().in("sensor_id", sensorIds);
      if (moveError) throw moveError;
      const { error: linkError } = await supabase
        .from("plant_sensors")
        .insert(sensorIds.map((sensor_id) => ({ plant_id: plantId, sensor_id })));
      if (linkError) throw linkError;
    }
  } catch (e) {
    return fail(e);
  }
  if (!id) redirect(`/plants/${plantId}`);
  refresh();
  return { ok: true, message: "Gespeichert" };
}

/** Hides a plant but keeps its history; its sensor becomes free for another plant. */
export async function archivePlant(id: string) {
  const supabase = await createClient();
  await supabase.from("plants").update({ archived_at: new Date().toISOString() }).eq("id", id);
  await supabase.from("plant_sensors").delete().eq("plant_id", id);
  redirect("/");
}

export async function restorePlant(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("plants").update({ archived_at: null }).eq("id", id);
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

/** Deletes a plant with all its data (waterings, pots, photos, sensor links). */
export async function deletePlant(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: photos } = await supabase.from("plant_photos").select("storage_path").eq("plant_id", id);
    // closeups of accepted candidates are shared with the candidate row; removing the file is fine either way
    if (photos?.length) await supabase.storage.from("plant-photos").remove(photos.map((p) => p.storage_path));
    const { error } = await supabase.from("plants").delete().eq("id", id);
    if (error) throw error;
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true, message: "Pflanze gelöscht" };
}

/** Creates a plant straight from the room map, with the species' care values as targets. */
export async function createPlantOnMap(input: {
  roomId: string;
  name: string;
  speciesId: string | null;
  x: number;
  y: number;
  h: number | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!input.name.trim()) return { ok: false, error: "Bitte einen Namen eingeben." };
  try {
    const supabase = await createClient();
    const sp = input.speciesId
      ? ((await supabase.from("species").select("*").eq("id", input.speciesId).single()).data as Species | null)
      : null;
    const { data: plant, error } = await supabase
      .from("plants")
      .insert({
        name: input.name.trim(),
        species: sp?.common_name_de ?? null,
        species_id: sp?.id ?? null,
        room_id: input.roomId,
        map_x: input.x,
        map_y: input.y,
        map_height_m: input.h,
        ...(sp ? speciesTargets(sp) : {}),
      })
      .select("id")
      .single();
    if (error) throw error;
    await supabase.from("pots").insert({ plant_id: plant.id, soil_type: sp?.soil_type ?? "universal" });
    refresh();
    return { ok: true, id: plant.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}

export async function repot(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const plantId = str(fd, "plant_id");
  const date = str(fd, "started_at");
  if (!plantId) return { ok: false, error: "Pflanze fehlt." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("pots").insert({
      plant_id: plantId,
      started_at: date ? new Date(`${date}T12:00:00`).toISOString() : new Date().toISOString(),
      volume_l: num(fd, "volume_l"),
      diameter_cm: num(fd, "diameter_cm"),
      height_cm: num(fd, "height_cm"),
      soil_type: str(fd, "soil_type") ?? "universal",
      notes: str(fd, "notes"),
    });
    if (error) throw error;
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true, message: "Umtopfen gespeichert – die App lernt jetzt neu." };
}

// --- Photos ----------------------------------------------------------------

/** Registers an uploaded diary photo and runs the AI health check on it. */
export async function registerPhoto(input: { plantId: string; path: string; reason: string | null }): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("plant_photos")
      .insert({ plant_id: input.plantId, storage_path: input.path, reason: input.reason ?? "manual" })
      .select("id")
      .single();
    if (error) throw error;
    try {
      await callFunction("analyze-photo", { body: { photo_id: data.id } });
    } catch (e) {
      refresh();
      return { ok: true, message: `Foto gespeichert, KI-Check fehlgeschlagen: ${e instanceof Error ? e.message : e}` };
    }
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true, message: "Foto gespeichert und ausgewertet." };
}

export async function reanalyzePhoto(photoId: string): Promise<ActionResult> {
  try {
    await callFunction("analyze-photo", { body: { photo_id: photoId } });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

export async function deletePhoto(photoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data } = await supabase.from("plant_photos").select("storage_path").eq("id", photoId).single();
  if (data) await supabase.storage.from("plant-photos").remove([data.storage_path]);
  const { error } = await supabase.from("plant_photos").delete().eq("id", photoId);
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

// --- Rooms & floor plan ----------------------------------------------------

export async function saveRoom(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const fields = {
    name: str(fd, "name"),
    humidity_min: num(fd, "humidity_min") ?? 40,
    humidity_max: num(fd, "humidity_max") ?? 60,
  };
  if (!fields.name) return { ok: false, error: "Bitte einen Namen eingeben." };
  const hygrometerId = str(fd, "hygrometer_id");
  try {
    const supabase = await createClient();
    let roomId = id;
    if (id) {
      const { error } = await supabase.from("rooms").update(fields).eq("id", id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("rooms").insert(fields).select("id").single();
      if (error) throw error;
      roomId = data.id;
    }
    // One hygrometer per room: detach others, attach the chosen one.
    await supabase.from("sensors").update({ room_id: null }).eq("room_id", roomId!).eq("type", "hygrometer");
    if (hygrometerId) await supabase.from("sensors").update({ room_id: roomId }).eq("id", hygrometerId);
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true, message: "Gespeichert" };
}

export async function deleteRoom(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("rooms").delete().eq("id", id);
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

export async function setRoomPhotos(roomId: string, paths: string[]): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: room } = await supabase.from("rooms").select("photo_paths").eq("id", roomId).single();
  const removed = ((room?.photo_paths as string[]) ?? []).filter((p) => !paths.includes(p));
  if (removed.length > 0) await supabase.storage.from("plant-photos").remove(removed);
  const { error } = await supabase.from("rooms").update({ photo_paths: paths.slice(0, 4) }).eq("id", roomId);
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

export type PlanSuggestion = {
  floor_plan: FloorPlan;
  plants: { plant_id: string; x: number; y: number; height_m: number; confidence: string }[];
  candidates: CandidateSuggestion[];
};

export async function suggestFloorPlan(roomId: string): Promise<{ ok: true; suggestion: PlanSuggestion } | { ok: false; error: string }> {
  try {
    return { ok: true, suggestion: await callFunction<PlanSuggestion>("plan-room", { body: { room_id: roomId } }) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}

/** Searches the room photos for plants again, keeping the saved floor plan as it is. */
export async function rescanPlants(roomId: string): Promise<ActionResult> {
  try {
    const r = await callFunction<PlanSuggestion>("plan-room", { body: { room_id: roomId, mode: "plants" } });
    const supabase = await createClient();
    await supabase.from("plant_candidates").delete().eq("room_id", roomId).eq("status", "open");
    if (r.candidates.length > 0) {
      const { error } = await supabase.from("plant_candidates").insert(
        r.candidates.map((c) => ({
          room_id: roomId,
          photo_path: c.photo_path,
          box: c.box,
          description: c.description,
          species_guess: c.species_guess,
          species_id: c.species_id,
          confidence: c.confidence,
          map_x: c.map_x,
          map_y: c.map_y,
          map_height_m: c.height_m,
        })),
      );
      if (error) throw error;
    }
    // plants that have no spot on the map yet get the one found on the photos
    const { data: unplaced } = await supabase.from("plants").select("id").eq("room_id", roomId).is("map_x", null);
    for (const p of r.plants.filter((p) => unplaced?.some((u) => u.id === p.plant_id))) {
      await supabase.from("plants").update({ map_x: p.x, map_y: p.y, map_height_m: p.height_m }).eq("id", p.plant_id);
    }
    refresh();
    const n = r.candidates.length;
    return { ok: true, message: n === 0 ? "Keine neuen Pflanzen gefunden." : `${n} neue Pflanze(n) gefunden – unten prüfen und anlegen.` };
  } catch (e) {
    return fail(e);
  }
}

export async function saveFloorPlan(input: {
  roomId: string;
  floorPlan: FloorPlan;
  positions: { plantId: string; x: number | null; y: number | null; h: number | null }[];
  /** Plants the AI spotted that are not set up yet; replaces the room's open candidates. */
  candidates?: CandidateSuggestion[];
}): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("rooms").update({ floor_plan: input.floorPlan }).eq("id", input.roomId);
    if (error) throw error;
    for (const p of input.positions) {
      const { error: posError } = await supabase.from("plants").update({ map_x: p.x, map_y: p.y, map_height_m: p.h }).eq("id", p.plantId);
      if (posError) throw posError;
    }
    if (input.candidates) {
      await supabase.from("plant_candidates").delete().eq("room_id", input.roomId).eq("status", "open");
      if (input.candidates.length > 0) {
        const { error: candError } = await supabase.from("plant_candidates").insert(
          input.candidates.map((c) => ({
            room_id: input.roomId,
            photo_path: c.photo_path,
            box: c.box,
            description: c.description,
            species_guess: c.species_guess,
            species_id: c.species_id,
            confidence: c.confidence,
            map_x: c.map_x,
            map_y: c.map_y,
            map_height_m: c.height_m,
          })),
        );
        if (candError) throw candError;
      }
    }
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true, message: "Karte gespeichert" };
}

// --- Sensors & vacations ---------------------------------------------------

export async function saveSensor(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  if (!id) return { ok: false, error: "Sensor fehlt." };
  const supabase = await createClient();
  const { error } = await supabase.from("sensors").update({ name: str(fd, "name"), room_id: str(fd, "room_id") }).eq("id", id);
  if (error) return fail(error);
  refresh();
  return { ok: true, message: "Gespeichert" };
}

export async function deleteSensor(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("sensors").delete().eq("id", id);
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

export async function addVacation(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const starts = str(fd, "starts_on");
  const ends = str(fd, "ends_on");
  if (!starts || !ends || ends < starts) return { ok: false, error: "Bitte gültigen Zeitraum wählen." };
  const supabase = await createClient();
  const { error } = await supabase.from("vacations").insert({ starts_on: starts, ends_on: ends, notes: str(fd, "notes") });
  if (error) return fail(error);
  refresh();
  return { ok: true, message: "Urlaub eingetragen" };
}

export async function deleteVacation(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("vacations").delete().eq("id", id);
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

// --- Notifications ---------------------------------------------------------

const NTFY_SERVER = "https://ntfy.sh";
const TOPIC = /^[A-Za-z0-9_-]{1,64}$/;

export async function saveNotifySettings(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const topic = str(fd, "ntfy_topic");
  if (topic && !TOPIC.test(topic)) return { ok: false, error: "Topic: nur Buchstaben, Ziffern, - und _ (max. 64 Zeichen)." };
  const hour = (key: string) => {
    const n = num(fd, key);
    return n === null ? null : Math.min(23, Math.max(0, Math.round(n)));
  };
  const supabase = await createClient();
  const { error } = await supabase
    .from("notify_settings")
    .update({ ntfy_topic: topic, quiet_from: hour("quiet_from"), quiet_to: hour("quiet_to"), updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return fail(error);
  refresh();
  return { ok: true, message: topic ? "Gespeichert" : "Gespeichert – Benachrichtigungen aus" };
}

export async function sendTestPush(topic: string): Promise<ActionResult> {
  if (!TOPIC.test(topic)) return { ok: false, error: "Erst ein gültiges Topic eintragen." };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "Nicht angemeldet" };
  const res = await fetch(NTFY_SERVER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, title: "Mo'sSmartPlantCare", message: "Test: Benachrichtigungen kommen an.", tags: ["seedling"] }),
  });
  return res.ok ? { ok: true, message: "Gesendet – kommt sie in der ntfy-App an?" } : { ok: false, error: `ntfy: HTTP ${res.status}` };
}

export async function setRoomScan(roomId: string, path: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: room } = await supabase.from("rooms").select("scan_path").eq("id", roomId).single();
  if (room?.scan_path && room.scan_path !== path) await supabase.storage.from("plant-photos").remove([room.scan_path]);
  const { error } = await supabase.from("rooms").update({ scan_path: path }).eq("id", roomId);
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

/** Exact geometry from an IFC scan: kept as scan_plan and shown as the room's map right away. */
export async function setRoomScanPlan(roomId: string, plan: FloorPlan | null): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("rooms")
    .update(plan ? { scan_plan: plan, floor_plan: plan } : { scan_plan: null })
    .eq("id", roomId);
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

// --- Species & detected plants ---------------------------------------------

/** Existing species matching `name`, or a new profile written by Claude. */
export async function ensureSpecies(name: string): Promise<{ ok: true; species: Species } | { ok: false; error: string }> {
  try {
    const { species } = await callFunction<{ species: Species }>("plant-species", { body: { action: "ensure", name } });
    refresh();
    return { ok: true, species };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}

export async function loadSpeciesImages(): Promise<ActionResult> {
  try {
    const r = await callFunction<{ checked: number; found: number }>("plant-species", { body: { action: "images", limit: 30 } });
    refresh();
    return { ok: true, message: `${r.found} von ${r.checked} Bildern gefunden` };
  } catch (e) {
    return fail(e);
  }
}

export async function saveSpecies(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  if (!id) return { ok: false, error: "Art fehlt." };
  const fields = {
    common_name_de: str(fd, "common_name_de"),
    moisture_min: num(fd, "moisture_min"),
    moisture_max: num(fd, "moisture_max"),
    light_min_lux: num(fd, "light_min_lux"),
    light_max_lux: num(fd, "light_max_lux"),
    temp_min_c: num(fd, "temp_min_c"),
    temp_max_c: num(fd, "temp_max_c"),
    humidity_min: num(fd, "humidity_min"),
    humidity_max: num(fd, "humidity_max"),
    conductivity_min: num(fd, "conductivity_min"),
    conductivity_max: num(fd, "conductivity_max"),
    winter_rest: fd.get("winter_rest") === "on",
    winter_moisture_min: num(fd, "winter_moisture_min"),
    fertilize_every_days: num(fd, "fertilize_every_days"),
    care_notes: str(fd, "care_notes"),
  };
  if (!fields.common_name_de || fields.moisture_min === null || fields.moisture_max === null) {
    return { ok: false, error: "Name und Feuchtebereich sind Pflicht." };
  }
  if (fields.moisture_min >= fields.moisture_max) return { ok: false, error: "Feuchte: Minimum muss kleiner als Maximum sein." };
  const supabase = await createClient();
  const { error } = await supabase.from("species").update(fields).eq("id", id);
  if (error) return fail(error);
  refresh();
  return { ok: true, message: "Gespeichert" };
}

/** Identifies the species on an uploaded photo; creates a species profile if it is missing. */
export async function identifyPhoto(path: string): Promise<
  { ok: true; species: Species | null; name: string | null; confidence: "high" | "medium" | "low"; reasoning: string } | { ok: false; error: string }
> {
  try {
    const r = await callFunction<{
      guess: string | null;
      common_name_de?: string;
      confidence: "high" | "medium" | "low";
      reasoning: string;
      species: Species | null;
    }>("plant-species", { body: { action: "identify", photo_path: path } });
    refresh();
    return { ok: true, species: r.species, name: r.species?.common_name_de ?? r.common_name_de ?? r.guess, confidence: r.confidence, reasoning: r.reasoning };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}

/** Takes a close-up of a detected plant and lets Claude identify the species. */
export async function identifyCandidate(candidateId: string, closeupPath: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await supabase.from("plant_candidates").update({ closeup_path: closeupPath }).eq("id", candidateId);
    const r = await callFunction<{
      guess: string | null;
      common_name_de?: string;
      confidence: "high" | "medium" | "low";
      reasoning: string;
      species: Species | null;
    }>("plant-species", { body: { action: "identify", photo_path: closeupPath } });
    const { error } = await supabase
      .from("plant_candidates")
      .update({ species_guess: r.guess, species_id: r.species?.id ?? null, confidence: r.confidence })
      .eq("id", candidateId);
    if (error) throw error;
    refresh();
    if (!r.guess) return { ok: true, message: "Auf dem Foto ist keine Pflanze zu erkennen." };
    return { ok: true, message: `${r.species?.common_name_de ?? r.common_name_de ?? r.guess} (${r.reasoning})` };
  } catch (e) {
    return fail(e);
  }
}

/** Creates a plant from a detected candidate, with the species' care values as targets. */
export async function acceptCandidate(input: { candidateId: string; name: string; speciesId: string | null }): Promise<ActionResult> {
  if (!input.name.trim()) return { ok: false, error: "Bitte einen Namen eingeben." };
  try {
    const supabase = await createClient();
    const { data: c, error: cError } = await supabase.from("plant_candidates").select("*").eq("id", input.candidateId).single();
    if (cError) throw cError;
    const sp = input.speciesId
      ? ((await supabase.from("species").select("*").eq("id", input.speciesId).single()).data as Species | null)
      : null;
    const { data: plant, error } = await supabase
      .from("plants")
      .insert({
        name: input.name.trim(),
        species: sp?.common_name_de ?? c.species_guess,
        species_id: sp?.id ?? null,
        room_id: c.room_id,
        map_x: c.map_x,
        map_y: c.map_y,
        map_height_m: c.map_height_m,
        ...(sp ? speciesTargets(sp) : {}),
      })
      .select("id")
      .single();
    if (error) throw error;
    await supabase.from("pots").insert({ plant_id: plant.id, soil_type: sp?.soil_type ?? "universal" });
    if (c.closeup_path) {
      await supabase.from("plant_photos").insert({ plant_id: plant.id, storage_path: c.closeup_path, reason: "manual" });
    }
    await supabase.from("plant_candidates").update({ status: "accepted", plant_id: plant.id }).eq("id", c.id);
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true, message: "Pflanze angelegt" };
}

export async function dismissCandidate(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("plant_candidates").update({ status: "dismissed" }).eq("id", id);
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

function speciesTargets(sp: Species) {
  return {
    moisture_min: sp.moisture_min,
    moisture_max: sp.moisture_max,
    light_min_lux: sp.light_min_lux,
    light_max_lux: sp.light_max_lux,
    temp_min_c: sp.temp_min_c,
    temp_max_c: sp.temp_max_c,
    conductivity_min: sp.conductivity_min,
    conductivity_max: sp.conductivity_max,
  };
}
