import type { RoomSummary } from "./types";

// Watering list for whoever looks after the plants during a vacation: per plant how often and how much,
// from what the app has learned (watering from the target minimum up to the maximum).

export type SitterItem = { name: string; everyDays: number | null; ml: number | null };

export function sitterItems(rooms: RoomSummary[]): { room: string; plants: SitterItem[] }[] {
  return rooms
    .filter((r) => r.plants.length > 0)
    .map((r) => ({
      room: r.name,
      plants: r.plants.map((p) => {
        const span = p.target.max - p.target.min;
        const ml = p.learning.ml_per_point ? Math.max(10, Math.round((span * p.learning.ml_per_point) / 10) * 10) : null;
        const everyDays = p.learning.dry_rate_per_day ? Math.min(30, Math.max(1, Math.round(span / p.learning.dry_rate_per_day))) : null;
        return { name: p.name, everyDays, ml };
      }),
    }));
}

function line(p: SitterItem): string {
  if (p.everyDays && p.ml) return `${p.name}: ${p.everyDays === 1 ? "jeden Tag" : `alle ${p.everyDays} Tage`} ca. ${p.ml} ml`;
  if (p.ml) return `${p.name}: ca. ${p.ml} ml, wenn die Erde oben trocken ist`;
  return `${p.name}: gießen, wenn die Erde oben trocken ist`;
}

export function sitterText(rooms: RoomSummary[], period?: string): string {
  const groups = sitterItems(rooms);
  const parts = [`Gießliste${period ? ` (${period})` : ""}`];
  for (const g of groups) parts.push([g.room, ...g.plants.map((p) => `• ${line(p)}`)].join("\n"));
  parts.push("Im Zweifel lieber etwas weniger als zu viel. Danke! 🌿");
  return parts.join("\n\n");
}
