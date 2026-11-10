import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectRises,
  type HourPoint,
  learn,
  learnDryRate,
  learnMlPerPoint,
  type PlantInput,
  photoRequest,
  potVolumeL,
  type PotPeriod,
  seasonOf,
  summarize,
  type Watering,
} from "./watering.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-11-20T12:00:00Z");

/**
 * Simulated hourly moisture: starts at `start`, dries `rate` points/day, and at each
 * watering (hours before `end`) jumps up to `to` within one hour.
 */
function simulate(opts: { hours: number; start: number; rate: number; end?: number; waterings?: { hoursAgo: number; to: number }[] }): HourPoint[] {
  const end = opts.end ?? NOW;
  const series: HourPoint[] = [];
  let m = opts.start;
  for (let h = opts.hours; h >= 0; h--) {
    const hour = end - h * HOUR;
    const w = opts.waterings?.find((x) => x.hoursAgo === h);
    if (w) m = w.to;
    else m = Math.max(0, m - opts.rate / 24);
    series.push({ hour, moisture: Math.round(m * 10) / 10 });
  }
  return series;
}

function period(series: HourPoint[], waterings: Watering[], volume_l: number | null = 3, started_at = NOW - 60 * DAY): PotPeriod {
  return { pot: { started_at, volume_l, soil_type: "universal" }, series, waterings };
}

function plant(current: PotPeriod, extra: Partial<PlantInput> = {}): PlantInput {
  const last = current.series[current.series.length - 1];
  return {
    moisture_min: 20,
    moisture_max: 45,
    photo_interval_days: 14,
    current,
    previous: null,
    latest_moisture: last ? { value: last.moisture as number, ts: last.hour } : null,
    last_photo_at: NOW - DAY,
    now: NOW,
    ...extra,
  };
}

// Two waterings 10 and 4 days ago, each from ≈ 21 % back to 45 % (rise ≈ 23.8), drying 4 points/day.
const TWO_WATERINGS = simulate({
  hours: 14 * 24,
  start: 37,
  rate: 4,
  waterings: [{ hoursAgo: 10 * 24, to: 45 }, { hoursAgo: 4 * 24, to: 45 }],
});
const watering = (hoursAgo: number, amount_ml: number, during_vacation = false): Watering => ({
  ts: NOW - hoursAgo * HOUR,
  amount_ml,
  during_vacation,
});

test("seasonOf uses meteorological seasons", () => {
  assert.equal(seasonOf(Date.parse("2026-01-15T00:00:00Z")), "winter");
  assert.equal(seasonOf(Date.parse("2026-03-01T00:00:00Z")), "spring");
  assert.equal(seasonOf(Date.parse("2026-08-31T00:00:00Z")), "summer");
  assert.equal(seasonOf(Date.parse("2026-11-20T00:00:00Z")), "autumn");
  assert.equal(seasonOf(Date.parse("2026-12-01T00:00:00Z")), "winter");
});

test("detectRises finds waterings and ignores normal drying and noise", () => {
  const rises = detectRises(TWO_WATERINGS);
  assert.equal(rises.length, 2);
  assert.equal(rises[0].ts, NOW - 10 * 24 * HOUR);
  assert.equal(rises[0].peak, 45);
  assert.ok(Math.abs(rises[0].before - 21.2) < 0.5, `got ${rises[0].before}`);
  assert.equal(rises[1].ts, NOW - 4 * 24 * HOUR);

  const noisy = simulate({ hours: 72, start: 40, rate: 3 }).map((p, i) => ({
    ...p,
    moisture: (p.moisture as number) + (i % 2 ? 2 : -2),
  }));
  assert.equal(detectRises(noisy).length, 0);
});

test("learnMlPerPoint: amount / rise, vacation waterings excluded", () => {
  // Rise ≈ 23.8 points; 240 ml → ≈ 10 ml/point.
  const p = period(TWO_WATERINGS, [watering(240, 240), watering(96, 240)]);
  const l = learnMlPerPoint(p, NOW);
  assert.equal(l.samples, 2);
  assert.ok(Math.abs((l.value as number) - 10) < 0.5, `got ${l.value}`);

  const vacation = period(TWO_WATERINGS, [watering(240, 250, true), watering(96, 250, true)]);
  assert.deepEqual(learnMlPerPoint(vacation, NOW), { value: null, samples: 0 });
});

test("learnDryRate recovers the simulated rate", () => {
  const rate = learnDryRate(period(TWO_WATERINGS, []), NOW) as number;
  assert.ok(Math.abs(rate - 4) < 0.3, `got ${rate}`);
});

test("learn: pot-size formula without any data", () => {
  const l = learn(plant(period([], [], 3)));
  // 3 l × 1000 × 0.4 (universal) / 100 = 12 ml per point
  assert.equal(l.ml_per_point, 12);
  assert.equal(l.source, "pot_size");
  assert.equal(l.confidence, "estimate");
  assert.equal(l.dry_rate_per_day, null);
});

test("learn: after repotting, the previous pot's values are scaled to the new pot", () => {
  const previousPot = period(TWO_WATERINGS, [watering(240, 240), watering(96, 240)], 3, NOW - 90 * DAY);
  const fresh = period([], [], 6, NOW - DAY);
  const l = learn(plant(fresh, { previous: previousPot }));
  assert.equal(l.source, "previous_pot");
  // ≈ 10 ml/point in 3 l → ≈ 20 in 6 l
  assert.ok(Math.abs((l.ml_per_point as number) - 20) < 1, `got ${l.ml_per_point}`);
  // Larger pot dries slower: 4 / √2 ≈ 2.8
  assert.ok(Math.abs((l.dry_rate_per_day as number) - 2.83) < 0.3, `got ${l.dry_rate_per_day}`);
});

test("learn: own data is blended with the prior and takes over", () => {
  // Real behaviour: 480 ml per ≈ 23.8 points ≈ 20 ml/point, while the formula says 12.
  const one = learn(plant(period(TWO_WATERINGS, [watering(96, 480)])));
  assert.equal(one.source, "learned");
  assert.equal(one.confidence, "low");
  assert.ok(Math.abs((one.ml_per_point as number) - 16) < 0.5, `got ${one.ml_per_point}`); // 50/50

  const two = learn(plant(period(TWO_WATERINGS, [watering(240, 480), watering(96, 480)])));
  assert.ok(Math.abs((two.ml_per_point as number) - 17.4) < 0.5, `got ${two.ml_per_point}`); // 2/3 learned
});

test("summarize: status, amount and forecast", () => {
  // 4 days after watering to 45 at 4/day → ≈ 29; 20 is reached in ≈ 2.3 days.
  const ok = summarize(plant(period(TWO_WATERINGS, [watering(240, 250), watering(96, 250)])));
  assert.equal(ok.status, "ok");
  assert.equal(ok.recommended_ml, null);
  const daysLeft = ((ok.next_watering_at as number) - NOW) / DAY;
  assert.ok(Math.abs(daysLeft - 2.3) < 0.3, `got ${daysLeft}`);

  const dry = simulate({ hours: 8 * 24, start: 50, rate: 4, waterings: [{ hoursAgo: 7 * 24, to: 45 }] });
  const soon = summarize(plant(period(dry, [watering(168, 300)])));
  assert.equal(soon.status, "water_now"); // 45 - 7 × 4 = 17 ≤ 20
  assert.ok(soon.recommended_ml !== null && soon.recommended_ml % 10 === 0);
  // (45 - 17) points × learned ml/point
  assert.ok(soon.recommended_ml! >= 250 && soon.recommended_ml! <= 450, `got ${soon.recommended_ml}`);
});

test("summarize: a watering logged just now silences 'water now' until the sensor catches up", () => {
  const dry = simulate({ hours: 8 * 24, start: 50, rate: 4, waterings: [{ hoursAgo: 7 * 24, to: 45 }] });
  const s = summarize(plant(period(dry, [watering(168, 300), { ts: NOW - 10 * 60_000, amount_ml: 300, during_vacation: false }])));
  assert.equal(s.status, "ok");
  assert.equal(s.recommended_ml, null);
  assert.ok(s.hints.some((h) => h.code === "just_watered"));
  // three hours later the sensor counts again
  const later = summarize(plant(period(dry, [watering(168, 300), watering(3, 300)])));
  assert.equal(later.status, "water_now");
});

test("summarize: stale data gives no_data", () => {
  const s = summarize(plant(period(TWO_WATERINGS, []), { latest_moisture: { value: 30, ts: NOW - 5 * HOUR } }));
  assert.equal(s.status, "no_data");
  assert.equal(s.moisture, null);
});

test("summarize: unlogged waterings are offered for confirmation", () => {
  const s = summarize(plant(period(TWO_WATERINGS, [watering(240, 250)])));
  assert.equal(s.pending_waterings.length, 1); // the one 4 days ago; 10 days ago is logged
  assert.equal(s.pending_waterings[0].ts, NOW - 96 * HOUR);
  assert.ok(s.hints.some((h) => h.code === "confirm_watering"));
});

test("summarize: hints for wet soil, no recovery and new pot", () => {
  const wet = simulate({ hours: 4 * 24, start: 60, rate: 0.5 });
  assert.ok(summarize(plant(period(wet, []))).hints.some((h) => h.code === "stays_wet"));

  // Watered 1 day ago but moisture kept falling.
  const flat = simulate({ hours: 3 * 24, start: 30, rate: 3 });
  const noRecovery = summarize(plant(period(flat, [watering(24, 200)])));
  assert.ok(noRecovery.hints.some((h) => h.code === "no_recovery"));

  const repotted = summarize(plant(period([], [], 4, NOW - 2 * DAY)));
  assert.ok(repotted.hints.some((h) => h.code === "relearning"));
});

test("photoRequest priorities", () => {
  const base = plant(period(TWO_WATERINGS, [watering(240, 250), watering(96, 250)]));
  // Recent photo, nothing special.
  assert.equal(photoRequest({ ...base, last_photo_at: NOW - DAY }, []), null);
  // Interval elapsed.
  assert.equal(photoRequest({ ...base, last_photo_at: NOW - 15 * DAY }, [])?.reason, "scheduled");
  assert.equal(photoRequest({ ...base, last_photo_at: null }, [])?.reason, "scheduled");
  // Anomaly beats schedule.
  const anomaly = [{ code: "stays_wet", severity: "warning" as const, message: "" }];
  assert.equal(photoRequest({ ...base, last_photo_at: NOW - 15 * DAY }, anomaly)?.reason, "anomaly");
  // Repot beats everything.
  const repot = { ...base, current: { ...base.current, pot: { ...base.current.pot, started_at: NOW - 2 * DAY } } };
  assert.equal(photoRequest({ ...repot, last_photo_at: NOW - 3 * DAY }, anomaly)?.reason, "repot");
  // Season start (1 December) without photo since then.
  const dec3 = Date.parse("2026-12-03T12:00:00Z");
  assert.equal(photoRequest({ ...base, now: dec3, last_photo_at: dec3 - 5 * DAY }, [])?.reason, "season");
  assert.equal(photoRequest({ ...base, now: dec3, last_photo_at: dec3 - DAY }, []), null);
});

test("pot volume: measured value wins, else estimated from the diameter", () => {
  assert.equal(potVolumeL(3, 20), 3);
  assert.equal(potVolumeL(null, 12), 0.8);
  assert.equal(potVolumeL(null, 17), 2.4);
  assert.equal(potVolumeL(null, null), null);
});
