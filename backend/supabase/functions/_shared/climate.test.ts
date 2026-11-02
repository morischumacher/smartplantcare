import assert from "node:assert/strict";
import { test } from "node:test";
import { climateAlerts, type ClimateRoom } from "./climate.ts";

const room = (over: Partial<ClimateRoom> = {}): ClimateRoom => ({
  name: "Wohnzimmer",
  humidity: 50,
  humidity_min: 40,
  humidity_max: 60,
  temperature: 21,
  plant_targets: [{ temp_min_c: 16, temp_max_c: 28 }],
  ...over,
});

test("no alert inside the target or within the margin", () => {
  assert.deepEqual(climateAlerts([room(), room({ humidity: 38, temperature: 15.6 })]), []);
});

test("dry air: warning, far below: critical", () => {
  const [a] = climateAlerts([room({ humidity: 31.4 })]);
  assert.equal(a.kind, "humidity");
  assert.equal(a.severity, "warning");
  assert.equal(a.message, "Luft zu trocken (31,4 %) – befeuchten");
  assert.equal(climateAlerts([room({ humidity: 22 })])[0].severity, "critical");
});

test("humid air asks to air the room", () => {
  assert.match(climateAlerts([room({ humidity: 70 })])[0].message, /zu feucht.*lüften/);
});

test("strictest plant target counts for temperature", () => {
  const targets = [{ temp_min_c: 12, temp_max_c: 30 }, { temp_min_c: 18, temp_max_c: null }];
  const [a] = climateAlerts([room({ temperature: 16, plant_targets: targets })]);
  assert.equal(a.kind, "temperature");
  assert.equal(a.message, "Zu kalt (16 °C) – wärmer stellen");
});

test("default range without plant targets, nothing without plants", () => {
  assert.equal(climateAlerts([room({ temperature: 31, plant_targets: [{ temp_min_c: null, temp_max_c: null }] })]).length, 1);
  assert.deepEqual(climateAlerts([room({ temperature: 5, plant_targets: [] })]), []);
});

test("critical alerts first, missing values ignored", () => {
  const out = climateAlerts([
    room({ name: "Bad", humidity: 66 }),
    room({ name: "Flur", humidity: null, temperature: 8 }),
  ]);
  assert.deepEqual(out.map((a) => [a.room, a.severity]), [["Flur", "critical"], ["Bad", "warning"]]);
});
