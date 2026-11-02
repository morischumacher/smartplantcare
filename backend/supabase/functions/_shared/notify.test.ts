import assert from "node:assert/strict";
import { test } from "node:test";
import { collectEvents, decide, inQuietHours, type NotifyInput, type NotifyState } from "./notify.ts";

const H = 3_600_000;
const NOW = Date.parse("2026-11-02T12:00:00Z"); // 13:00 in Berlin

const summary: NotifyInput = {
  rooms: [{
    name: "Wohnzimmer",
    plants: [
      { id: "p1", name: "Monstera", status: "water_now", moisture: 17.6, recommended_ml: 250, hints: [] },
      { id: "p2", name: "Efeutute", status: "ok", moisture: 40, recommended_ml: null, hints: [
        { code: "stays_wet", severity: "warning", message: "Bleibt lange nass – weniger gießen" },
        { code: "confirm_watering", severity: "info", message: "Gießen erkannt" },
      ] },
      { id: "p3", name: "Kaktus", status: "no_data", moisture: null, recommended_ml: null, hints: [] },
    ],
  }],
  alerts: [{ kind: "humidity", severity: "critical", room: "Wohnzimmer", message: "Luft zu trocken (22 %) – befeuchten" }],
};
const sensors = [
  { id: "s1", name: "Monstera-Sensor", mac: "AA", last_seen_at: new Date(NOW - 7 * H).toISOString(), in_use: true },
  { id: "s2", name: null, mac: "BB", last_seen_at: new Date(NOW - 7 * H).toISOString(), in_use: false },
  { id: "s3", name: "neu", mac: "CC", last_seen_at: null, in_use: true },
];

test("events: water now with amount, warning hints, climate, silent sensors in use", () => {
  const events = collectEvents(summary, sensors, NOW);
  assert.deepEqual(events.map((e) => e.key), ["water:p1", "hint:p2:stays_wet", "climate:Wohnzimmer:humidity", "sensor:s1"]);
  assert.equal(events[0].message, "Monstera: 18 % – bitte ca. 250 ml gießen");
  assert.equal(events[2].critical, true);
  assert.match(events[3].message, /seit 7 Std\./);
});

const event = (key: string, critical = false) => ({ key, title: key, message: key, priority: critical ? 5 : 4, tags: [], critical, path: "/" });

test("new event is sent once, then again only after a day", () => {
  const first = decide([event("a")], [], { now: NOW, quiet: false, vacation: false });
  assert.equal(first.send.length, 1);
  const again = decide([event("a")], first.state, { now: NOW + 2 * H, quiet: false, vacation: false });
  assert.equal(again.send.length, 0);
  const nextDay = decide([event("a")], first.state, { now: NOW + 25 * H, quiet: false, vacation: false });
  assert.equal(nextDay.send.length, 1);
});

test("flapping event is not resent within the gap", () => {
  const sent: NotifyState[] = [{ key: "a", active: true, last_sent_at: new Date(NOW).toISOString() }];
  const gone = decide([], sent, { now: NOW + H, quiet: false, vacation: false });
  assert.deepEqual(gone.state, [{ key: "a", active: false, last_sent_at: new Date(NOW).toISOString() }]);
  assert.equal(decide([event("a")], gone.state, { now: NOW + 2 * H, quiet: false, vacation: false }).send.length, 0);
  assert.equal(decide([event("a")], gone.state, { now: NOW + 13 * H, quiet: false, vacation: false }).send.length, 1);
});

test("quiet hours and vacation hold back all but critical, held ones go out later", () => {
  const night = decide([event("a"), event("b", true)], [], { now: NOW, quiet: true, vacation: false });
  assert.deepEqual(night.send.map((e) => e.key), ["b"]);
  const morning = decide([event("a"), event("b", true)], night.state, { now: NOW + H, quiet: false, vacation: false });
  assert.deepEqual(morning.send.map((e) => e.key), ["a"]);
  assert.deepEqual(decide([event("a")], [], { now: NOW, quiet: false, vacation: true }).send, []);
});

test("quiet hours in Berlin time, also across midnight", () => {
  assert.equal(inQuietHours(NOW, 22, 8), false); // 13:00
  assert.equal(inQuietHours(Date.parse("2026-11-02T22:30:00Z"), 22, 8), true); // 23:30
  assert.equal(inQuietHours(Date.parse("2026-11-02T06:30:00Z"), 22, 8), true); // 07:30
  assert.equal(inQuietHours(Date.parse("2026-11-02T07:30:00Z"), 22, 8), false); // 08:30
  assert.equal(inQuietHours(NOW, 12, 14), true);
  assert.equal(inQuietHours(NOW, null, null), false);
});
