import assert from "node:assert/strict";
import { test } from "node:test";
import { applyRoutine, planPlant, sameDay, wateringDays } from "./schedule.ts";

const DAY = 86_400_000;
// Monday 2026-11-23, 09:00 Berlin
const MON = Date.parse("2026-11-23T08:00:00Z");
const SUN = 7;
const WED = 3;

test("watering days: the coming chosen weekdays at noon, today included", () => {
  const days = wateringDays([SUN, WED], MON, 14);
  assert.equal(new Date(days[0]).toISOString(), "2026-11-25T11:00:00.000Z"); // Wed
  assert.equal(new Date(days[1]).toISOString(), "2026-11-29T11:00:00.000Z"); // Sun
  assert.ok(sameDay(wateringDays([1], MON, 7)[0], MON)); // Monday itself
  assert.deepEqual(wateringDays([], MON), []);
});

const plant = { moisture: 40, min: 15, max: 45, dry_rate_per_day: 3, ml_per_point: 10, next_at: MON + (25 / 3) * DAY };

test("a plant that lasts until a later watering day waits for it", () => {
  // 40 % falling 3/day reaches 15 % after ~8.3 days (Tue next week); watering days: Sundays only
  const p = planPlant(plant, wateringDays([SUN], MON), MON)!;
  assert.equal(p.kind, "day");
  assert.equal(new Date(p.at).toISOString(), "2026-11-29T11:00:00.000Z"); // this Sunday, next Sunday is too late
  // on Sunday it is at 40 - 3*6.1 ≈ 21.6 → (45 - 21.6) * 10 ≈ 230 ml
  assert.equal(p.ml, 230);
  assert.equal(p.too_fast, false);
});

test("a plant that gets too dry before the next watering day gets an extra day", () => {
  const dry = { ...plant, moisture: 20, next_at: MON + (5 / 3) * DAY };
  const p = planPlant(dry, wateringDays([SUN], MON), MON)!;
  assert.equal(p.kind, "extra");
  assert.equal(p.at, dry.next_at);
});

test("too fast for the routine: even full it doesn't last a week", () => {
  const thirsty = { ...plant, dry_rate_per_day: 6, next_at: MON + (25 / 6) * DAY };
  const p = planPlant(thirsty, wateringDays([SUN], MON), MON)!;
  assert.equal(p.too_fast, true); // (45 - 15) / 6 = 5 days < 7
});

test("no plan without data", () => {
  assert.equal(planPlant({ ...plant, moisture: null }, wateringDays([SUN], MON), MON), null);
  assert.equal(planPlant({ ...plant, dry_rate_per_day: null }, wateringDays([SUN], MON), MON), null);
});

test("applyRoutine: due on the watering day, soon two days before, ok otherwise", () => {
  const base = { status: "ok", moisture: 40, min: 15, max: 45, next_watering_at: MON + (25 / 3) * DAY, recommended_ml: null, dry_rate_per_day: 3, ml_per_point: 10, hints: [] };
  const sunday = Date.parse("2026-11-29T08:00:00Z");
  const onDay = applyRoutine({ ...base, moisture: 22, next_watering_at: sunday + (7 / 3) * DAY }, wateringDays([SUN], sunday), sunday);
  assert.equal(onDay.status, "water_now");
  assert.equal(onDay.recommended_ml, 230);
  const friday = Date.parse("2026-11-27T08:00:00Z");
  assert.equal(applyRoutine({ ...base, moisture: 28 }, wateringDays([SUN], friday), friday).status, "water_soon");
  assert.equal(applyRoutine(base, wateringDays([SUN], MON), MON).status, "ok");
  assert.equal(applyRoutine(base, [], MON).routine, null);
  const justWatered = applyRoutine({ ...base, hints: [{ code: "just_watered", severity: "info", message: "" }] }, wateringDays([SUN], MON), MON);
  assert.equal(justWatered.routine, null);
});
