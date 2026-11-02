import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeMac, secretsMatch, validatePayload } from "./validate.ts";

const NOW = Date.parse("2026-11-02T10:00:00Z");

test("normalizeMac accepts common formats", () => {
  assert.equal(normalizeMac("c4:7c:8d:6a:12:34"), "C4:7C:8D:6A:12:34");
  assert.equal(normalizeMac("C47C8D6A1234"), "C4:7C:8D:6A:12:34");
  assert.equal(normalizeMac("c4-7c-8d-6a-12-34"), "C4:7C:8D:6A:12:34");
  assert.equal(normalizeMac("C4:7C:8D"), null);
  assert.equal(normalizeMac(42), null);
});

test("accepts a batch of flower care and hygrometer readings", () => {
  const { readings, errors } = validatePayload({
    readings: [
      { mac: "c4:7c:8d:6a:12:34", type: "flower_care", moisture: 23.04, temperature: 21.4, light: 850.6, conductivity: 340, rssi: -71 },
      { mac: "A4:C1:38:11:22:33", type: "hygrometer", temperature: 20.1, humidity: 38.5, battery: 87 },
    ],
  }, NOW);
  assert.deepEqual(errors, []);
  assert.equal(readings.length, 2);
  assert.equal(readings[0].mac, "C4:7C:8D:6A:12:34");
  assert.equal(readings[0].moisture, 23);
  assert.equal(readings[0].light, 851);
  assert.equal(readings[0].humidity, null);
  assert.equal(readings[1].humidity, 38.5);
  assert.equal(readings[1].ts, null);
});

test("accepts a single reading object without wrapper", () => {
  const { readings, errors } = validatePayload({ mac: "A4C138112233", type: "hygrometer", humidity: 45 }, NOW);
  assert.deepEqual(errors, []);
  assert.equal(readings.length, 1);
});

test("keeps valid readings and reports invalid ones", () => {
  const { readings, errors } = validatePayload({
    readings: [
      { mac: "C4:7C:8D:6A:12:34", type: "flower_care", moisture: 140 },
      { mac: "nope", type: "flower_care", moisture: 20 },
      { mac: "C4:7C:8D:6A:12:35", type: "thermostat", temperature: 20 },
      { mac: "C4:7C:8D:6A:12:36", type: "flower_care", moisture: "20" },
      { mac: "C4:7C:8D:6A:12:37", type: "hygrometer", battery: 90 },
      { mac: "C4:7C:8D:6A:12:38", type: "flower_care", moisture: 31 },
    ],
  }, NOW);
  assert.equal(readings.length, 1);
  assert.equal(readings[0].mac, "C4:7C:8D:6A:12:38");
  assert.equal(errors.length, 5);
  assert.match(errors[0], /moisture=140 out of range/);
  assert.match(errors[1], /invalid mac/);
  assert.match(errors[2], /type must be/);
  assert.match(errors[3], /moisture must be a number/);
  assert.match(errors[4], /no measurement values/);
});

test("validates timestamps", () => {
  const ok = validatePayload({ mac: "C47C8D6A1234", type: "flower_care", moisture: 20, ts: "2026-11-02T09:55:00Z" }, NOW);
  assert.equal(ok.readings[0].ts, "2026-11-02T09:55:00.000Z");
  const future = validatePayload({ mac: "C47C8D6A1234", type: "flower_care", moisture: 20, ts: "2026-11-03T10:00:00Z" }, NOW);
  assert.match(future.errors[0], /in the future/);
  const garbage = validatePayload({ mac: "C47C8D6A1234", type: "flower_care", moisture: 20, ts: 1730541600 }, NOW);
  assert.match(garbage.errors[0], /ISO timestamp/);
});

test("rejects malformed bodies", () => {
  assert.deepEqual(validatePayload(null).errors, ["body must be a JSON object"]);
  assert.deepEqual(validatePayload({ readings: [] }).errors, ["readings must be a non-empty array"]);
  assert.match(validatePayload({ readings: Array(101).fill({}) }).errors[0], /at most 100/);
});

test("secretsMatch", () => {
  assert.equal(secretsMatch("s3cret", "s3cret"), true);
  assert.equal(secretsMatch("s3cre", "s3cret"), false);
  assert.equal(secretsMatch("s3cretX", "s3cret"), false);
  assert.equal(secretsMatch(null, "s3cret"), false);
  assert.equal(secretsMatch("", ""), false);
});
