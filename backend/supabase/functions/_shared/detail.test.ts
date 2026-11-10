import assert from "node:assert/strict";
import { test } from "node:test";
import { buckets, type DetailPlant, plantDetail, roomDetail } from "./detail.ts";

const H = 3_600_000;
const NOW = Date.parse("2026-11-09T20:30:00Z");

test("buckets average their points and keep gaps as null", () => {
  const out = buckets([{ ts: 0, value: 10 }, { ts: H, value: 20 }, { ts: 3 * H, value: null }, { ts: 5 * H, value: 30 }], 0, 6 * H, 2 * H);
  assert.deepEqual(out, [15, null, 30]);
});

const plant = (over: Partial<DetailPlant> = {}): DetailPlant => ({
  id: "p1",
  name: "Efeutute",
  status: "water_now",
  moisture: 31.4,
  temperature: 21.4,
  light: 300,
  conductivity: 430,
  light_peak_7d: 1200,
  target: { min: 35, max: 60 },
  temp_target: { min: 16, max: 28 },
  recommended_ml: 250,
  next_watering_at: "2026-11-09T20:00:00.000Z",
  last_watering: { ts: "2026-11-03T18:00:00.000Z", amount_ml: 300 },
  learning: { ml_per_point: 11.96, dry_rate_per_day: 3.12, samples: 5 },
  hints: [{ severity: "info", message: "x" }, { severity: "warning", message: "Steht zu kalt" }],
  ...over,
});

test("plant detail: values, rhythm and the most important hint", () => {
  const d = plantDetail(plant(), [], [], NOW);
  assert.equal(d.moisture, 31);
  assert.equal(d.light, 1200);
  assert.equal(d.last_ml, 300);
  assert.equal(d.last_h, 146);
  assert.equal(d.next_h, 0);
  assert.equal(d.every_days, 8);
  assert.equal(d.dry_rate, 3.1);
  assert.equal(d.ml_per_point, 12);
  assert.equal(d.hint, "Steht zu kalt");
});

test("plant detail: 42 four-hour steps ending at the current step, waterings as indexes", () => {
  const history = [{ ts: NOW - H, moisture: 32 }, { ts: NOW - 2 * H, moisture: 34 }];
  const d = plantDetail(plant(), history, [{ ts: NOW - 6 * 24 * H }, { ts: NOW - 30 * 24 * H }], NOW);
  assert.equal(d.series.length, 42);
  assert.equal(d.series[40], 33); // 16–20 h; the last step (20–24 h) has no reading yet
  assert.deepEqual(d.days, ["Di", "Mi", "Do", "Fr", "Sa", "So", "Mo"]);
  assert.deepEqual(d.watered, [5]);
});

test("plant detail without learning or watering", () => {
  const d = plantDetail(plant({ last_watering: null, learning: { ml_per_point: null, dry_rate_per_day: null, samples: 0 }, hints: [] }), [], [], NOW);
  assert.equal(d.last_h, null);
  assert.equal(d.every_days, null);
  assert.equal(d.hint, null);
});

test("room detail: climate and 24 hourly points", () => {
  const room = { id: "r1", name: "Mein Zimmer", climate: { temperature: 20.2, humidity: 50.7, status: "ok", target: { min: 40, max: 60 } } };
  const d = roomDetail(room, [{ ts: NOW - 10 * 60_000, humidity: 51, temperature: 20.2 }], NOW);
  assert.equal(d.humidity, 51);
  assert.equal(d.humidity_series.length, 24);
  assert.equal(d.humidity_series[23], 51);
  assert.equal(roomDetail({ ...room, climate: null }, [], NOW).status, "no_data");
});
