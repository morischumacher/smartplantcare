import assert from "node:assert/strict";
import { test } from "node:test";
import { compactSummary } from "./compact.ts";

const plant = (name: string, status: string, over = {}) => ({
  id: name.toLowerCase(),
  name,
  status,
  moisture: 23.6,
  recommended_ml: 250,
  next_watering_at: null,
  hints: [],
  ...over,
});

test("plants of all rooms, most urgent first, with room name and rounded moisture", () => {
  const out = compactSummary({
    generated_at: "2026-11-02T12:00:00Z",
    attention: 1,
    alerts: [{ kind: "humidity", severity: "warning", direction: "low", room: "Wohnzimmer", value: 31, message: "Luft zu trocken (31 %) – befeuchten" }],
    rooms: [
      { id: "r1", name: "Wohnzimmer", climate: { temperature: 21.3, humidity: 44.6, status: "ok" }, plants: [plant("Monstera", "ok")] },
      { id: null, name: "Ohne Raum", climate: null, plants: [plant("Efeutute", "water_now", { hints: [{ severity: "warning", message: "Gießen" }] })] },
    ],
  });
  assert.deepEqual(out.plants.map((p) => [p.name, p.room, p.moisture]), [["Efeutute", "Ohne Raum", 24], ["Monstera", "Wohnzimmer", 24]]);
  assert.equal(out.plants[0].hint, "Gießen");
  assert.deepEqual(out.alerts, [{ room: "Wohnzimmer", kind: "humidity", severity: "warning", message: "Luft zu trocken (31 %) – befeuchten" }]);
  assert.equal(out.plants[0].id, "efeutute");
  assert.deepEqual(out.rooms, [{ id: "r1", name: "Wohnzimmer", humidity: 45, temperature: 21.3, status: "ok" }]);
});
