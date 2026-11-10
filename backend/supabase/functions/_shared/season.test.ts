import assert from "node:assert/strict";
import { test } from "node:test";
import { berlinTime, seasonTargets, winterPause } from "./season.ts";

const at = (iso: string) => Date.parse(iso);
const base = {
  moisture: { min: 15, max: 45 },
  temp: { min: 15, max: 30 },
  light: { min: 300, max: 15000 },
  ec: { min: 300, max: 1500 },
  winter_rest: false,
  winter_moisture_min: null,
  light_peak: 2000,
};

test("Berlin month and hour, across the date line", () => {
  assert.deepEqual(berlinTime(at("2026-12-31T23:30:00Z")), { month: 0, hour: 0 });
  assert.deepEqual(berlinTime(at("2026-07-01T12:00:00Z")), { month: 6, hour: 14 });
});

test("winter pause: Nov–Feb always, Oct/Mar only when too dark, never in summer", () => {
  assert.equal(winterPause(at("2026-11-10T12:00:00Z"), 5000, 300), true);
  assert.equal(winterPause(at("2026-10-10T12:00:00Z"), 5000, 300), false);
  assert.equal(winterPause(at("2026-10-10T12:00:00Z"), 200, 300), true);
  assert.equal(winterPause(at("2026-07-10T12:00:00Z"), 50, 300), false);
});

test("summer: the plant's own targets, no seasonal light band", () => {
  const s = seasonTargets({ ...base, now: at("2026-07-10T12:00:00Z") });
  assert.equal(s.winter, null);
  assert.equal(s.light_season, null);
  assert.deepEqual(s.moisture, base.moisture);
  assert.deepEqual(s.temp, base.temp);
  assert.deepEqual(s.ec, base.ec);
});

test("winter pause: seasonal light band, no fertiliser minimum, moisture unchanged", () => {
  const s = seasonTargets({ ...base, now: at("2026-11-10T12:00:00Z") });
  assert.equal(s.winter, "pause");
  assert.deepEqual(s.light, base.light);
  assert.deepEqual(s.light_season, { min: 150, max: 7500 });
  assert.deepEqual(s.ec, { min: null, max: 1500 });
  assert.deepEqual(s.moisture, base.moisture);
  assert.equal(s.temp.min, 15);
});

test("winter rest: drier threshold and cooler minimum; a little cooler at night for everyone", () => {
  const rest = seasonTargets({ ...base, winter_rest: true, winter_moisture_min: 10, now: at("2026-12-10T12:00:00Z") });
  assert.equal(rest.winter, "rest");
  assert.equal(rest.moisture.min, 10);
  assert.equal(rest.temp.min, 12);
  const night = seasonTargets({ ...base, now: at("2026-07-10T23:00:00Z") });
  assert.equal(night.temp.min, 13);
});
