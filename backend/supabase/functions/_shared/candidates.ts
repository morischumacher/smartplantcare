// Merges plants Claude reports more than once (same plant seen from different angles) and drops
// detections that are plants already set up. Pure logic, tested with node --test.

export type Confidence = "high" | "medium" | "low";
const RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

export interface Detection {
  species_id: string | null;
  species_guess: string;
  confidence: Confidence;
  map_x: number;
  map_y: number;
  seen_on: number[]; // photo indices
}

export interface KnownPlant {
  species_id: string | null;
  x: number;
  y: number;
}

/** Same plant if the species matches (or one is unknown) and the positions are close on the map. */
const SAME_SPOT_M = 1.0;
const KNOWN_SPOT_M = 0.6;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const sameSpecies = (a: { species_id: string | null }, b: { species_id: string | null }) =>
  !a.species_id || !b.species_id || a.species_id === b.species_id;

export function dedupeDetections<T extends Detection>(detections: T[], known: KnownPlant[] = []): T[] {
  // most confident first, so the kept entry is the best one
  const sorted = [...detections].sort((a, b) => RANK[b.confidence] - RANK[a.confidence]);
  const kept: T[] = [];
  for (const d of sorted) {
    const pos = { x: d.map_x, y: d.map_y };
    if (known.some((k) => dist(pos, k) < KNOWN_SPOT_M && sameSpecies(k, d))) continue;
    const twin = kept.find((k) => dist(pos, { x: k.map_x, y: k.map_y }) < SAME_SPOT_M && sameSpecies(k, d));
    if (twin) {
      twin.seen_on = [...new Set([...twin.seen_on, ...d.seen_on])].sort((a, b) => a - b);
      continue;
    }
    kept.push({ ...d, seen_on: [...d.seen_on] });
  }
  return kept;
}
