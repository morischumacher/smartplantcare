import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { getSensors } from "@/lib/data";

type Sensors = Awaited<ReturnType<typeof getSensors>>;

/** Flower Care sensors as checkbox options, noting which plant already uses each one. */
export async function sensorOptions(sensors: Sensors, currentPlantId?: string) {
  const supabase = await createClient();
  const { data: plants } = await supabase.from("plants").select("id, name").is("archived_at", null);
  const names = new Map((plants ?? []).map((p) => [p.id, p.name]));
  return sensors
    .filter((s) => s.type === "flower_care")
    .map((s) => {
      const other = s.plant_sensors.find((ps) => ps.plant_id !== currentPlantId);
      return { id: s.id, name: s.name ?? s.mac, taken_by: other ? (names.get(other.plant_id) ?? null) : null };
    });
}

const SILENT_AFTER_MS = 60 * 60_000;

/** Sensors in use (in a plant or a room) that were heard before but not within the last hour. */
export function silentSensors(sensors: Sensors, now = Date.now()) {
  return sensors.filter(
    (s) => s.last_seen_at && (s.plant_sensors.length > 0 || s.room_id) && now - new Date(s.last_seen_at).getTime() > SILENT_AFTER_MS,
  );
}
