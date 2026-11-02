// Slim summary for small clients (Scriptable widget, Garmin): no floor plans, learning details or
// hint lists – a Garmin background service has only a few KB for the response. Pure logic.

export interface FullPlant {
  name: string;
  status: string;
  moisture: number | null;
  recommended_ml: number | null;
  next_watering_at: string | null;
  hints: { severity: string; message: string }[];
}

export interface FullRoom {
  name: string;
  climate: { temperature: number | null; humidity: number | null; status: string } | null;
  plants: FullPlant[];
}

const STATUS_ORDER: Record<string, number> = { water_now: 0, water_soon: 1, no_data: 2, ok: 3 };
const MAX_PLANTS = 20;

export function compactSummary(full: { generated_at: string | null; attention: number; rooms: FullRoom[] }) {
  const plants = full.rooms
    .flatMap((r) =>
      r.plants.map((p) => ({
        name: p.name,
        room: r.name,
        status: p.status,
        moisture: p.moisture === null ? null : Math.round(p.moisture),
        ml: p.recommended_ml,
        next: p.next_watering_at,
        // most important hint, for the widget's second line
        hint: (p.hints.find((h) => h.severity === "warning") ?? null)?.message ?? null,
      })),
    )
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name))
    .slice(0, MAX_PLANTS);
  return {
    generated_at: full.generated_at,
    attention: full.attention,
    plants,
    rooms: full.rooms
      .filter((r) => r.climate)
      .map((r) => ({
        name: r.name,
        humidity: r.climate!.humidity === null ? null : Math.round(r.climate!.humidity),
        temperature: r.climate!.temperature,
        status: r.climate!.status,
      })),
  };
}
