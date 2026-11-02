import assert from "node:assert/strict";
import { test } from "node:test";
import { planFromElements, type IfcElement } from "./ifc-plan.ts";

// A 4.0 × 3.0 m room, rotated by 20°, window on the right wall, door at the bottom, a bed.
const turn = (20 * Math.PI) / 180;
const r = ([x, y]: [number, number]): [number, number] => [x * Math.cos(turn) - y * Math.sin(turn) + 5, x * Math.sin(turn) + y * Math.cos(turn) - 2];
const box = (x0: number, y0: number, x1: number, y1: number): [number, number][] =>
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map((p) => r(p as [number, number]));
const t = 0.1; // wall thickness
const room: IfcElement[] = [
  { kind: "wall", label: null, points: box(-t / 2, -t / 2, 2.0, t / 2) }, // top wall in two pieces
  { kind: "wall", label: null, points: box(2.0, -t / 2, 4 + t / 2, t / 2) },
  { kind: "wall", label: null, points: box(4 - t / 2, 0, 4 + t / 2, 3) }, // right
  { kind: "wall", label: null, points: box(-t / 2, 3 - t / 2, 4 + t / 2, 3 + t / 2) }, // bottom
  { kind: "wall", label: null, points: box(-t / 2, 0, t / 2, 3) }, // left
  { kind: "window", label: "Window", points: box(4 - t / 2, 0.8, 4 + t / 2, 2.2) },
  { kind: "door", label: "Door", points: box(1, 3 - t / 2, 1.9, 3 + t / 2) },
  { kind: "furniture", label: "Bed 1", points: box(0.2, 0.2, 1.6, 2.2) },
];

test("aligns to the walls and puts the window wall at the top", () => {
  const plan = planFromElements(room);
  // window was on the 3 m right wall -> after turning it to the top, width 3 m and depth 4 m
  assert.ok(Math.abs(plan.width_m - 3) < 0.05, `width ${plan.width_m}`);
  assert.ok(Math.abs(plan.depth_m - 4) < 0.05, `depth ${plan.depth_m}`);
  assert.equal(plan.outline.length, 4);
  const win = plan.features.find((f) => f.kind === "window")!;
  assert.ok(win.y1 < 0.05 && win.y2 < 0.05, "window on top wall");
  assert.ok(Math.abs(Math.abs(win.x2 - win.x1) - 1.4) < 0.05, "window 1.4 m long");
  const door = plan.features.find((f) => f.kind === "door")!;
  assert.ok(Math.abs(door.x1 - door.x2) < 0.05, "door on a side wall after turning");
  const bed = plan.furniture[0];
  assert.equal(bed.label, "Bett");
  assert.ok(Math.abs(bed.w - 2) < 0.05 && Math.abs(bed.h - 1.4) < 0.05, `bed ${bed.w}×${bed.h}`);
});

test("rejects a scan without walls", () => {
  assert.throws(() => planFromElements([{ kind: "window", label: null, points: box(0, 0, 1, 0.1) }]), /Wände/);
});
