import type { FloorPlan } from "@/lib/types";

// Turns the elements of an IFC room scan (walls, windows, doors, furniture as point clouds in plan
// view, metres) into our abstract floor plan: aligned to the walls, origin top-left, the wall with
// the most window at the top. Pure logic, no web-ifc dependency, so it can be tested in Node.

export type ElementKind = "wall" | "window" | "door" | "furniture";
export interface IfcElement {
  kind: ElementKind;
  label: string | null;
  /** Footprint points in plan view: [x, y] in metres. */
  points: [number, number][];
}

type P = [number, number];
type Rect = { c: P; u: P; v: P; len: number; thick: number };

const round = (v: number) => Math.round(v * 100) / 100;
const add = (a: P, b: P, s = 1): P => [a[0] + b[0] * s, a[1] + b[1] * s];
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
const rotate = ([x, y]: P, a: number): P => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

/** Oriented bounding rectangle via principal axis. */
function footprint(points: P[]): Rect {
  const n = points.length;
  const mean: P = [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of points) {
    sxx += (x - mean[0]) ** 2;
    syy += (y - mean[1]) ** 2;
    sxy += (x - mean[0]) * (y - mean[1]);
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const u: P = [Math.cos(angle), Math.sin(angle)];
  const v: P = [-u[1], u[0]];
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const p of points) {
    const d: P = [p[0] - mean[0], p[1] - mean[1]];
    a0 = Math.min(a0, dot(d, u)); a1 = Math.max(a1, dot(d, u));
    b0 = Math.min(b0, dot(d, v)); b1 = Math.max(b1, dot(d, v));
  }
  const c = add(add(mean, u, (a0 + a1) / 2), v, (b0 + b1) / 2);
  return { c, u, v, len: a1 - a0, thick: b1 - b0 };
}

const ends = (r: Rect): [P, P] => [add(r.c, r.u, -r.len / 2), add(r.c, r.u, r.len / 2)];

/** Intersection of the infinite lines through a1-a2 and b1-b2, or null if parallel. */
function intersect([a1, a2]: [P, P], [b1, b2]: [P, P]): P | null {
  const d1: P = [a2[0] - a1[0], a2[1] - a1[1]];
  const d2: P = [b2[0] - b1[0], b2[1] - b1[1]];
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-6) return null;
  const t = ((b1[0] - a1[0]) * d2[1] - (b1[1] - a1[1]) * d2[0]) / den;
  return add(a1, d1, t);
}

function convexHull(points: P[]): P[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: P[]) => {
    const h: P[] = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(pts), ...half([...pts].reverse())];
}

/** Chains wall centre lines end-to-end into a closed outline; corners are the line intersections. */
function outlineFromWalls(walls: [P, P][]): P[] {
  if (walls.length < 3) return convexHull(walls.flat());
  const used = new Set<number>();
  const start = walls.reduce((best, w, i) => (dist(w[0], w[1]) > dist(walls[best][0], walls[best][1]) ? i : best), 0);
  const chain: [P, P][] = [walls[start]];
  used.add(start);
  while (used.size < walls.length) {
    const tail = chain[chain.length - 1][1];
    let best = -1, flip = false, bestD = 0.6; // max gap between connected walls
    walls.forEach((w, i) => {
      if (used.has(i)) return;
      const d0 = dist(tail, w[0]);
      const d1 = dist(tail, w[1]);
      if (d0 < bestD) { best = i; flip = false; bestD = d0; }
      if (d1 < bestD) { best = i; flip = true; bestD = d1; }
    });
    if (best < 0) break;
    used.add(best);
    chain.push(flip ? [walls[best][1], walls[best][0]] : walls[best]);
  }
  const closes = dist(chain[chain.length - 1][1], chain[0][0]) < 0.6;
  if (chain.length < 3 || !closes || used.size < walls.length * 0.75) return convexHull(walls.flat());
  const corners = chain.map((w, i) => {
    const prev = chain[(i - 1 + chain.length) % chain.length];
    // Collinear pieces of one wall have no real corner: use the joint instead.
    return angleBetween(prev, w) > 0.35 ? (intersect(prev, w) ?? w[0]) : midpoint(prev[1], w[0]);
  });
  return dropCollinear(corners);
}

const midpoint = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** Angle between two segments' directions, 0…π/2. */
function angleBetween([a1, a2]: [P, P], [b1, b2]: [P, P]): number {
  const a = Math.atan2(a2[1] - a1[1], a2[0] - a1[0]);
  const b = Math.atan2(b2[1] - b1[1], b2[0] - b1[0]);
  const d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d);
}

function dropCollinear(points: P[]): P[] {
  const out = points.filter((p, i) => {
    const a = points[(i - 1 + points.length) % points.length];
    const b = points[(i + 1) % points.length];
    const cross = (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
    return Math.abs(cross) / (dist(a, b) || 1) > 0.05; // more than 5 cm off the line a–b
  });
  return out.length >= 3 ? out : points;
}

const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Projects a point onto the nearest outline edge. */
function snapToOutline(p: P, outline: P[]): P {
  let best: P = p, bestD = Infinity;
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length];
    const ab: P = [b[0] - a[0], b[1] - a[1]];
    const t = Math.max(0, Math.min(1, dot([p[0] - a[0], p[1] - a[1]], ab) / (dot(ab, ab) || 1)));
    const q = add(a, ab, t);
    const d = dist(p, q);
    if (d < bestD) { best = q; bestD = d; }
  });
  return best;
}

const FURNITURE_DE: [RegExp, string][] = [
  [/bed|bett/i, "Bett"],
  [/sofa|couch/i, "Sofa"],
  [/table|tisch|desk/i, "Tisch"],
  [/chair|stuhl/i, "Stuhl"],
  [/storage|cabinet|shelf|wardrobe|schrank|regal/i, "Schrank"],
  [/tele|tv|fernseh/i, "Fernseher"],
  [/fridge|refrigerator|kühlschrank/i, "Kühlschrank"],
  [/stove|herd/i, "Herd"],
  [/oven|ofen/i, "Ofen"],
  [/dishwasher|spülmaschine/i, "Spülmaschine"],
  [/sink|spüle|waschbecken/i, "Spüle"],
  [/washer|dryer|wasch/i, "Waschmaschine"],
  [/toilet|wc/i, "WC"],
  [/bath|wanne/i, "Badewanne"],
  [/fireplace|kamin/i, "Kamin"],
  [/stair|treppe/i, "Treppe"],
];
const furnitureLabel = (name: string | null) => FURNITURE_DE.find(([re]) => name && re.test(name))?.[1] ?? "Möbel";

export function planFromElements(elements: IfcElement[]): FloorPlan {
  const withPoints = elements.filter((e) => e.points.length >= 3);
  const wallRects = withPoints.filter((e) => e.kind === "wall").map((e) => footprint(e.points));
  if (wallRects.length === 0) throw new Error("Keine Wände im Scan gefunden.");

  // Rotate so the walls run along the axes (dominant direction, modulo 90°, weighted by length).
  let c4 = 0, s4 = 0;
  for (const r of wallRects) {
    const a = Math.atan2(r.u[1], r.u[0]);
    c4 += Math.cos(4 * a) * r.len;
    s4 += Math.sin(4 * a) * r.len;
  }
  const turn = -Math.atan2(s4, c4) / 4;
  const els = withPoints.map((e) => ({ ...e, points: e.points.map((p) => rotate(p, turn)) }));

  const walls = els.filter((e) => e.kind === "wall").map((e) => ends(footprint(e.points)));
  let outline = outlineFromWalls(walls);
  let openings = els
    .filter((e) => e.kind === "window" || e.kind === "door")
    .map((e) => ({ kind: e.kind as "window" | "door", seg: ends(footprint(e.points)) }));
  let furniture = els
    .filter((e) => e.kind === "furniture")
    .map((e) => {
      const xs = e.points.map((p) => p[0]);
      const ys = e.points.map((p) => p[1]);
      return { label: furnitureLabel(e.label), min: [Math.min(...xs), Math.min(...ys)] as P, max: [Math.max(...xs), Math.max(...ys)] as P };
    });

  // Quarter turns so the side with the most window length ends up at the top (y = 0).
  const windowSide = () => {
    const ys = outline.map((p) => p[1]);
    const xs = outline.map((p) => p[0]);
    const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    const score = [0, 0, 0, 0]; // top, right, bottom, left
    for (const o of openings.filter((o) => o.kind === "window")) {
      const m: P = [(o.seg[0][0] + o.seg[1][0]) / 2, (o.seg[0][1] + o.seg[1][1]) / 2];
      const d = [m[1] - box.y0, box.x1 - m[0], box.y1 - m[1], m[0] - box.x0];
      score[d.indexOf(Math.min(...d))] += dist(o.seg[0], o.seg[1]);
    }
    return score.indexOf(Math.max(...score));
  };
  const side = openings.some((o) => o.kind === "window") ? windowSide() : 0;
  if (side !== 0) {
    const q = (-side * Math.PI) / 2; // rotate counter-clockwise by side × 90°
    const r = (p: P) => rotate(p, q);
    outline = outline.map(r);
    openings = openings.map((o) => ({ ...o, seg: [r(o.seg[0]), r(o.seg[1])] as [P, P] }));
    furniture = furniture.map((f) => {
      const a = r(f.min), b = r(f.max);
      return { ...f, min: [Math.min(a[0], b[0]), Math.min(a[1], b[1])] as P, max: [Math.max(a[0], b[0]), Math.max(a[1], b[1])] as P };
    });
  }

  // Origin at the top-left corner of the outline.
  const x0 = Math.min(...outline.map((p) => p[0]));
  const y0 = Math.min(...outline.map((p) => p[1]));
  const shift = (p: P): P => [p[0] - x0, p[1] - y0];
  outline = outline.map(shift);
  const width = Math.max(...outline.map((p) => p[0]));
  const depth = Math.max(...outline.map((p) => p[1]));
  const clampX = (v: number) => round(Math.min(width, Math.max(0, v)));
  const clampY = (v: number) => round(Math.min(depth, Math.max(0, v)));

  return {
    width_m: round(width),
    depth_m: round(depth),
    outline: outline.map((p) => [clampX(p[0]), clampY(p[1])]),
    features: openings.map((o) => {
      const a = snapToOutline(shift(o.seg[0]), outline);
      const b = snapToOutline(shift(o.seg[1]), outline);
      return { kind: o.kind, x1: clampX(a[0]), y1: clampY(a[1]), x2: clampX(b[0]), y2: clampY(b[1]) };
    }),
    furniture: furniture.map((f) => {
      const a = shift(f.min), b = shift(f.max);
      const x = clampX(a[0]), y = clampY(a[1]);
      return { label: f.label, x, y, w: round(Math.max(0.2, clampX(b[0]) - x)), h: round(Math.max(0.2, clampY(b[1]) - y)) };
    }),
    source: "scan",
    generated_at: new Date().toISOString(),
  };
}
