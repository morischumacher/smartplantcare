import assert from "node:assert/strict";
import { test } from "node:test";
import { sitterText } from "./sitter.ts";
import type { RoomSummary } from "./types.ts";

const plant = (name: string, ml_per_point: number | null, dry_rate_per_day: number | null) =>
  ({ name, target: { min: 20, max: 50 }, learning: { ml_per_point, dry_rate_per_day } }) as RoomSummary["plants"][number];

test("watering list: interval and amount from what was learned, fallback without data", () => {
  const rooms = [
    { name: "Wohnzimmer", plants: [plant("Monstera", 10, 6), plant("Kaktus", 2, null), plant("Neu", null, null)] },
    { name: "Leer", plants: [] },
  ] as unknown as RoomSummary[];
  const text = sitterText(rooms, "1.–14. Juli");
  assert.match(text, /^Gießliste \(1\.–14\. Juli\)/);
  assert.match(text, /• Monstera: alle 5 Tage ca\. 300 ml/); // 30 points / 6 per day, 30 × 10 ml
  assert.match(text, /• Kaktus: ca\. 60 ml, wenn die Erde oben trocken ist/);
  assert.match(text, /• Neu: gießen, wenn die Erde oben trocken ist/);
  assert.doesNotMatch(text, /Leer/);
});
