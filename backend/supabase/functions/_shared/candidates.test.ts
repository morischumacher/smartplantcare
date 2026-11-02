import assert from "node:assert/strict";
import { test } from "node:test";
import { dedupeDetections } from "./candidates.ts";

const det = (over: Partial<Parameters<typeof dedupeDetections>[0][number]>) => ({
  species_id: "pothos",
  species_guess: "Epipremnum aureum",
  confidence: "medium" as const,
  map_x: 1,
  map_y: 1,
  seen_on: [1],
  ...over,
});

test("same species close together is merged, keeping the most confident", () => {
  const out = dedupeDetections([det({ seen_on: [2] }), det({ confidence: "high", map_x: 1.6, seen_on: [1] })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].confidence, "high");
  assert.deepEqual(out[0].seen_on, [1, 2]);
});

test("same species far apart stays two plants", () => {
  assert.equal(dedupeDetections([det({}), det({ map_x: 3 })]).length, 2);
});

test("different species at the same spot stay separate", () => {
  assert.equal(dedupeDetections([det({}), det({ species_id: "dieff", species_guess: "Dieffenbachia seguine" })]).length, 2);
});

test("unknown species next to a known one is treated as the same plant", () => {
  assert.equal(dedupeDetections([det({ confidence: "high" }), det({ species_id: null, species_guess: "Araceae", confidence: "low", map_y: 1.4 })]).length, 1);
});

test("detections at an existing plant's spot are dropped", () => {
  const out = dedupeDetections([det({}), det({ species_id: "dieff", map_x: 2.5 })], [{ species_id: "pothos", x: 1.2, y: 1.1 }]);
  assert.deepEqual(out.map((d) => d.species_id), ["dieff"]);
});
