import assert from "node:assert/strict";
import { test } from "node:test";
import { climateAlerts, plantTemperatureHint, type ClimateRoom } from "./climate.ts";

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

const plant = (temperature: number | null) => ({ temperature, temp_min_c: 16, temp_max_c: 28 });

test("plant: nothing inside its range or within the margins", () => {
  assert.equal(plantTemperatureHint(plant(15.2), null), null);
  assert.equal(plantTemperatureHint(plant(30.5), null), null);
  assert.equal(plantTemperatureHint(plant(null), null), null);
});

test("plant: cold spot even though the room is fine", () => {
  const h = plantTemperatureHint(plant(13.4), null);
  assert.equal(h?.code, "too_cold");
  assert.equal(h?.severity, "warning");
  assert.equal(h?.message, "Steht zu kalt (13,4 °C, mag ab 16 °C) – weg von Fenster oder Zugluft");
});

test("plant: too warm only well above its range (sensor in the sun)", () => {
  assert.equal(plantTemperatureHint(plant(31.5), null)?.code, "too_hot");
});

test("plant: no duplicate of a room alert in the same direction", () => {
  assert.equal(plantTemperatureHint(plant(12), "low"), null);
  assert.equal(plantTemperatureHint(plant(12), "high")?.code, "too_cold");
});

test("plant: default range without species targets", () => {
  assert.equal(plantTemperatureHint({ temperature: 10, temp_min_c: null, temp_max_c: null }, null)?.code, "too_cold");
  assert.equal(plantTemperatureHint({ temperature: 14, temp_min_c: null, temp_max_c: null }, null), null);
});

test("room alerts carry their direction", () => {
  assert.equal(climateAlerts([room({ temperature: 10 })])[0].direction, "low");
  assert.equal(climateAlerts([room({ humidity: 70 })])[0].direction, "high");
});
