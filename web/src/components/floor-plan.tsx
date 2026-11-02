"use client";

import { useId, useRef, useState } from "react";
import { StatusPill } from "@/components/ui";
import { STATUS, lightCategory, num } from "@/lib/format";
import { plantTodos } from "@/lib/todos";
import type { FloorPlan, PlantSummary } from "@/lib/types";

// Abstract top-down room map (robot-vacuum style): walls, windows, doors, heaters, furniture
// and plants as status-coloured pins with a light halo. Hover/tap a pin for details and to-dos.
// In edit mode, plants and furniture can be dragged and elements selected for removal.

type Pos = { x: number; y: number };
type PlantPos = Pos & { h?: number | null };
export type Selection = { kind: "feature" | "furniture"; index: number } | { kind: "plant"; id: string } | null;

const PAD = 0.45; // metres of margin around the room
const STACK_M = 0.3; // pins closer than this share a spot (e.g. shelves of one cupboard)
const STACK_GAP = 0.42;

/** Spreads pins that stand at the same spot (stacked on shelves) into a column, highest on top. */
function spread<T extends { pos: PlantPos }>(entries: T[]): (T & { shown: Pos })[] {
  const groups: T[][] = [];
  for (const e of entries) {
    const g = groups.find((g) => Math.hypot(g[0].pos.x - e.pos.x, g[0].pos.y - e.pos.y) < STACK_M);
    if (g) g.push(e);
    else groups.push([e]);
  }
  return groups.flatMap((g) =>
    [...g]
      .sort((a, b) => (b.pos.h ?? 0) - (a.pos.h ?? 0))
      .map((e, i) => ({ ...e, shown: { x: e.pos.x, y: e.pos.y + (i - (g.length - 1) / 2) * STACK_GAP } })),
  );
}

const heightLabel = (h: number | null | undefined) => (h && h >= 0.05 ? `${num(h, 1)} m` : null);

type Props = {
  plan: FloorPlan;
  plants: PlantSummary[];
  /** Detected plants not set up yet, drawn as dashed pins. */
  candidates?: { id: string; x: number; y: number; label: string }[];
  /** Overrides plant.map while editing. */
  positions?: Record<string, PlantPos | null>;
  editable?: boolean;
  compact?: boolean;
  selected?: Selection;
  onMovePlant?: (id: string, pos: Pos) => void;
  onMoveFurniture?: (index: number, pos: Pos) => void;
  onSelect?: (s: Selection) => void;
};

const sub = (a: Pos, b: Pos) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Pos) => Math.hypot(v.x, v.y);

function distToSegment(p: Pos, a: Pos, b: Pos) {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (ab.x ** 2 + ab.y ** 2 || 1)));
  return len(sub(p, { x: a.x + t * ab.x, y: a.y + t * ab.y }));
}

/** Unit normal of segment a→b that points towards the room's centre. */
function inwardNormal(a: Pos, b: Pos, centre: Pos): Pos {
  const d = sub(b, a);
  const l = len(d) || 1;
  const n = { x: -d.y / l, y: d.x / l };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const toCentre = sub(centre, mid);
  return n.x * toCentre.x + n.y * toCentre.y >= 0 ? n : { x: -n.x, y: -n.y };
}

function nearby(pos: PlantPos, plan: FloorPlan) {
  const notes: string[] = [];
  if (heightLabel(pos.h)) notes.push(`Steht auf ${heightLabel(pos.h)} Höhe`);
  const nearest = (kind: string) =>
    Math.min(
      Infinity,
      ...plan.features.filter((f) => f.kind === kind).map((f) => distToSegment(pos, { x: f.x1, y: f.y1 }, { x: f.x2, y: f.y2 })),
    );
  const heater = nearest("heater");
  const window = nearest("window");
  const door = nearest("door");
  if (heater < 1) notes.push(`Nah an der Heizung (${num(heater, 1)} m) – trocknet schneller, im Winter trockene Luft`);
  if (window < 0.8) notes.push(`Direkt am Fenster (${num(window, 1)} m)`);
  else if (window < 2) notes.push(`${num(window, 1)} m vom Fenster`);
  else if (window !== Infinity) notes.push(`Weit vom Fenster (${num(window, 1)} m)`);
  if (door < 1) notes.push("Nah an der Tür – Zugluft möglich");
  return notes;
}

export function FloorPlanMap({
  plan,
  plants,
  candidates = [],
  positions,
  editable = false,
  compact = false,
  selected = null,
  onMovePlant,
  onMoveFurniture,
  onSelect,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const drag = useRef<{ kind: "plant" | "furniture"; id: string; index: number; offset: Pos } | null>(null);

  const w = plan.width_m;
  const d = plan.depth_m;
  const outline = plan.outline.length >= 3 ? plan.outline : [[0, 0], [w, 0], [w, d], [0, d]];
  const centre = { x: w / 2, y: d / 2 };
  const vb = { x: -PAD, y: -PAD, w: w + 2 * PAD, h: d + 2 * PAD };
  const fontSize = Math.max(0.13, Math.min(0.2, Math.max(w, d) / 28));
  /** Keeps a label under a pin inside the map: near the left or right edge it is aligned to that side. */
  const labelAt = (x: number, text: string, size: number) => {
    const half = text.length * size * 0.3;
    if (x + half > w + PAD - 0.05) return { textAnchor: "end" as const, x: 0.17 };
    if (x - half < -PAD + 0.05) return { textAnchor: "start" as const, x: -0.17 };
    return { textAnchor: "middle" as const };
  };

  const placed = spread(
    plants
      .map((p) => ({ plant: p, pos: positions && p.id in positions ? positions[p.id] : p.map }))
      .filter((e): e is { plant: PlantSummary; pos: PlantPos } => e.pos !== null && e.pos !== undefined),
  );

  function toRoom(e: React.PointerEvent): Pos {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  }
  const clamp = (p: Pos) => ({
    x: Math.round(Math.min(w, Math.max(0, p.x)) * 100) / 100,
    y: Math.round(Math.min(d, Math.max(0, p.y)) * 100) / 100,
  });

  function startDrag(e: React.PointerEvent, kind: "plant" | "furniture", id: string, index: number, origin: Pos) {
    if (!editable) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = toRoom(e);
    drag.current = { kind, id, index, offset: sub(p, origin) };
    if (kind === "furniture") onSelect?.({ kind: "furniture", index });
  }
  function moveDrag(e: React.PointerEvent) {
    const dr = drag.current;
    if (!dr) return;
    const p = sub(toRoom(e), dr.offset);
    if (dr.kind === "plant") onMovePlant?.(dr.id, clamp(p));
    else onMoveFurniture?.(dr.index, clamp(p));
  }
  const endDrag = () => {
    drag.current = null;
  };

  const shown = pinned ?? active;
  const shownEntry = placed.find((e) => e.plant.id === shown);

  return (
    <div className="relative select-none" onPointerLeave={() => setActive(null)}>
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="h-auto w-full touch-none"
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerDown={() => {
          setPinned(null);
          onSelect?.(null);
        }}
        role="img"
        aria-label="Grundriss des Raums"
      >
        <defs>
          <radialGradient id={`halo-${uid}`}>
            <stop offset="0%" stopColor="#facc15" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#facc15" stopOpacity="0" />
          </radialGradient>
          <pattern id={`grid-${uid}`} width="0.5" height="0.5" patternUnits="userSpaceOnUse">
            <path d="M 0.5 0 L 0 0 0 0.5" fill="none" className="stroke-emerald-900/[0.06] dark:stroke-emerald-100/[0.06]" strokeWidth="0.01" />
          </pattern>
          <filter id={`shadow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0.03" stdDeviation="0.04" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* floor and walls */}
        <polygon points={outline.map((p) => p.join(",")).join(" ")} className="fill-emerald-50 dark:fill-emerald-950/40" />
        <polygon points={outline.map((p) => p.join(",")).join(" ")} fill={`url(#grid-${uid})`} />

        {/* furniture */}
        {plan.furniture.map((f, i) => {
          const isSel = selected?.kind === "furniture" && selected.index === i;
          const size = Math.min(fontSize, (f.w / Math.max(f.label.length, 3)) * 1.7, f.h * 0.6);
          return (
            <g
              key={`f${i}`}
              className={editable ? "cursor-move" : undefined}
              onPointerDown={(e) => startDrag(e, "furniture", "", i, { x: f.x, y: f.y })}
            >
              <rect
                x={f.x}
                y={f.y}
                width={f.w}
                height={f.h}
                rx={Math.min(0.1, f.w / 4, f.h / 4)}
                className={`fill-stone-300/70 dark:fill-stone-600/70 ${isSel ? "stroke-emerald-500" : "stroke-stone-300 dark:stroke-stone-600"}`}
                strokeWidth={isSel ? 0.05 : 0.015}
              />
              {!compact && (
                <text
                  x={f.x + f.w / 2}
                  y={f.y + f.h / 2}
                  fontSize={size}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="pointer-events-none fill-stone-500 dark:fill-stone-300"
                >
                  {f.label}
                </text>
              )}
              {!compact && f.height_m ? (
                <text
                  x={f.x + f.w / 2}
                  y={f.y + f.h / 2 + size * 1.1}
                  fontSize={size * 0.75}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="pointer-events-none fill-stone-400 dark:fill-stone-400"
                >
                  {num(f.height_m, 1)} m hoch
                </text>
              ) : null}
            </g>
          );
        })}

        <polygon
          points={outline.map((p) => p.join(",")).join(" ")}
          fill="none"
          className="stroke-stone-700 dark:stroke-stone-300"
          strokeWidth="0.1"
          strokeLinejoin="round"
        />

        {/* windows, doors, heaters */}
        {plan.features.map((f, i) => {
          const a = { x: f.x1, y: f.y1 };
          const b = { x: f.x2, y: f.y2 };
          const n = inwardNormal(a, b, centre);
          const isSel = selected?.kind === "feature" && selected.index === i;
          const select = editable
            ? (e: React.PointerEvent) => {
                e.stopPropagation();
                onSelect?.({ kind: "feature", index: i });
              }
            : undefined;
          const hl = isSel ? <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-emerald-500" strokeWidth="0.3" strokeOpacity="0.4" strokeLinecap="round" /> : null;
          if (f.kind === "window") {
            return (
              <g key={`w${i}`} onPointerDown={select} className={editable ? "cursor-pointer" : undefined}>
                {hl}
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-sky-400" strokeWidth="0.16" />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-sky-50 dark:stroke-sky-950" strokeWidth="0.04" />
              </g>
            );
          }
          if (f.kind === "heater") {
            const o = 0.14;
            return (
              <g key={`h${i}`} onPointerDown={select} className={editable ? "cursor-pointer" : undefined}>
                {hl}
                <line
                  x1={a.x + n.x * o}
                  y1={a.y + n.y * o}
                  x2={b.x + n.x * o}
                  y2={b.y + n.y * o}
                  className="stroke-orange-400"
                  strokeWidth="0.12"
                  strokeLinecap="round"
                />
                <line
                  x1={a.x + n.x * o}
                  y1={a.y + n.y * o}
                  x2={b.x + n.x * o}
                  y2={b.y + n.y * o}
                  className="stroke-orange-100 dark:stroke-orange-900"
                  strokeWidth="0.12"
                  strokeDasharray="0.02 0.06"
                />
              </g>
            );
          }
          // door: gap in the wall, leaf and swing arc
          const l = len(sub(b, a));
          const tip = { x: a.x + n.x * l, y: a.y + n.y * l };
          const ab = sub(b, a);
          const sweep = ab.x * n.y - ab.y * n.x > 0 ? 1 : 0;
          return (
            <g key={`d${i}`} onPointerDown={select} className={editable ? "cursor-pointer" : undefined}>
              {hl}
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-emerald-50 dark:stroke-stone-900" strokeWidth="0.12" />
              <path
                d={`M ${b.x} ${b.y} A ${l} ${l} 0 0 ${sweep} ${tip.x} ${tip.y}`}
                fill="none"
                className="stroke-stone-400"
                strokeWidth="0.02"
                strokeDasharray="0.05 0.04"
              />
              <line x1={a.x} y1={a.y} x2={tip.x} y2={tip.y} className="stroke-stone-500" strokeWidth="0.035" />
            </g>
          );
        })}

        {/* detected, not yet set up */}
        {candidates.map((c) => (
          <g key={c.id} transform={`translate(${c.x} ${c.y})`} className="pointer-events-none">
            <circle r={0.17} className="fill-white/80 stroke-violet-500 dark:fill-stone-900/80" strokeWidth="0.03" strokeDasharray="0.06 0.04" />
            <text fontSize={0.2} textAnchor="middle" dominantBaseline="central" className="fill-violet-600 font-medium dark:fill-violet-300">?</text>
            {!compact && (
              <text
                y={0.17 + fontSize * 0.95}
                fontSize={fontSize * 0.85}
                {...labelAt(c.x, c.label, fontSize * 0.85)}
                className="fill-violet-700 dark:fill-violet-300"
                style={{ paintOrder: "stroke" }}
                stroke="var(--halo-text, #ecfdf5)"
                strokeWidth={fontSize * 0.25}
              >
                {c.label}
              </text>
            )}
          </g>
        ))}

        {/* plants */}
        {placed.map(({ plant, pos, shown: at }) => {
          const light = lightCategory(plant.light_peak_7d);
          const r = 0.17;
          const isActive = shown === plant.id || (selected?.kind === "plant" && selected.id === plant.id);
          const stacked = at.y !== pos.y;
          const height = heightLabel(pos.h);
          const label = height ? `${plant.name} · ${height}` : plant.name;
          // stacked pins: label beside the pin, towards the room's middle
          const side = at.x > w / 2 ? { textAnchor: "end" as const, x: -(r + 0.07) } : { textAnchor: "start" as const, x: r + 0.07 };
          return (
            <g
              key={plant.id}
              transform={`translate(${at.x} ${at.y})`}
              className={editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}
              onPointerEnter={(e) => e.pointerType === "mouse" && setActive(plant.id)}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (editable) {
                  onSelect?.({ kind: "plant", id: plant.id });
                  startDrag(e, "plant", plant.id, 0, pos);
                }
                else setPinned((cur) => (cur === plant.id ? null : plant.id));
              }}
            >
              {stacked && (
                <line x1={0} y1={0} x2={0} y2={pos.y - at.y} className="pointer-events-none stroke-stone-400" strokeWidth="0.015" strokeDasharray="0.04 0.03" />
              )}
              {light && <circle r={0.22 + light.level * 0.13} fill={`url(#halo-${uid})`} className="pointer-events-none" />}
              {plant.status === "water_now" && (
                <circle r={r} fill="none" stroke={STATUS.water_now.fill} strokeWidth="0.03">
                  <animate attributeName="r" values={`${r};${r * 2.2}`} dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="stroke-opacity" values="0.9;0" dur="1.8s" repeatCount="indefinite" />
                </circle>
              )}
              <circle
                r={isActive ? r * 1.15 : r}
                fill={STATUS[plant.status].fill}
                stroke="white"
                strokeWidth="0.045"
                filter={`url(#shadow-${uid})`}
              />
              <path
                d="M-0.07 0.06c0-0.08 0.05-0.13 0.14-0.14-0.01 0.09-0.06 0.14-0.14 0.14Zm0 0 0.07-0.07"
                fill="none"
                stroke="white"
                strokeWidth="0.022"
                strokeLinecap="round"
                className="pointer-events-none"
              />
              {!compact && (
                <text
                  y={stacked ? fontSize * 0.35 : r + fontSize * 0.95}
                  fontSize={fontSize}
                  {...(stacked ? side : labelAt(at.x, label, fontSize))}
                  className="pointer-events-none fill-stone-700 font-medium dark:fill-stone-200"
                  style={{ paintOrder: "stroke" }}
                  stroke="var(--halo-text, #ecfdf5)"
                  strokeWidth={fontSize * 0.25}
                >
                  {plant.name}
                  {height && <tspan className="fill-stone-500 font-normal dark:fill-stone-400"> · {height}</tspan>}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {shownEntry && !editable && (
        <PlantTooltip
          plant={shownEntry.plant}
          notes={nearby(shownEntry.pos, plan)}
          left={((shownEntry.shown.x - vb.x) / vb.w) * 100}
          top={((shownEntry.shown.y - vb.y) / vb.h) * 100}
          onClose={() => setPinned(null)}
        />
      )}
    </div>
  );
}

function PlantTooltip({
  plant,
  notes,
  left,
  top,
  onClose,
}: {
  plant: PlantSummary;
  notes: string[];
  left: number;
  top: number;
  onClose: () => void;
}) {
  const todos = plantTodos(plant);
  const light = lightCategory(plant.light_peak_7d);
  const below = top < 45;
  const align = left < 30 ? "0%" : left > 70 ? "-100%" : "-50%";
  return (
    <div
      className="pointer-events-auto absolute z-20 w-64 max-w-[80vw]"
      style={{ left: `${left}%`, top: `${top}%`, transform: `translate(${align}, ${below ? "18px" : "calc(-100% - 18px)"})` }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="rounded-xl border border-stone-200 bg-white/95 p-3 text-sm shadow-xl backdrop-blur dark:border-stone-700 dark:bg-stone-900/95">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <a href={`/plants/${plant.id}`} className="block truncate font-medium hover:text-emerald-700 dark:hover:text-emerald-400">
              {plant.name}
            </a>
            {plant.species && <p className="truncate text-xs text-stone-500 italic">{plant.species}</p>}
          </div>
          <StatusPill status={plant.status} />
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-stone-100 py-1.5 dark:bg-stone-800">
            <dt className="text-stone-500">Feuchte</dt>
            <dd className="font-medium tabular-nums">{num(plant.moisture)} %</dd>
          </div>
          <div className="rounded-lg bg-stone-100 py-1.5 dark:bg-stone-800">
            <dt className="text-stone-500">Temp.</dt>
            <dd className="font-medium tabular-nums">{num(plant.temperature, 1)} °C</dd>
          </div>
          <div className="rounded-lg bg-stone-100 py-1.5 dark:bg-stone-800">
            <dt className="text-stone-500">Licht</dt>
            <dd className="font-medium">{light?.label ?? "–"}</dd>
          </div>
        </dl>
        {plant.light_peak_7d !== null && (
          <p className="mt-2 text-xs text-stone-500">Hellste Stunde der letzten 7 Tage: {num(plant.light_peak_7d)} lx</p>
        )}
        {todos.length > 0 && (
          <ul className="mt-2 space-y-1 border-t border-stone-100 pt-2 text-xs dark:border-stone-800">
            {todos.map((t) => (
              <li key={t.text} className="flex gap-1.5">
                <span
                  className={`mt-1 size-1.5 shrink-0 rounded-full ${t.level === "urgent" ? "bg-rose-500" : t.level === "todo" ? "bg-amber-400" : "bg-sky-400"}`}
                />
                <span className={t.level === "urgent" ? "font-medium" : undefined}>{t.text}</span>
              </li>
            ))}
          </ul>
        )}
        {notes.length > 0 && (
          <ul className="mt-2 space-y-0.5 border-t border-stone-100 pt-2 text-xs text-stone-500 dark:border-stone-800">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        <button onClick={onClose} className="absolute top-1 right-1 hidden rounded p-1 text-stone-400 [@media(hover:none)]:block" aria-label="Schließen">
          ×
        </button>
      </div>
    </div>
  );
}

/** Legend explaining map symbols. */
export function MapLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
      {(["water_now", "water_soon", "ok", "no_data"] as const).map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-full ${STATUS[s].dot}`} /> {STATUS[s].label}
        </span>
      ))}
      <span className="flex items-center gap-1.5"><span className="h-1 w-4 rounded bg-sky-400" /> Fenster</span>
      <span className="flex items-center gap-1.5"><span className="h-1 w-4 rounded bg-orange-400" /> Heizung</span>
      <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-yellow-300/60" /> Licht (Größe = Helligkeit)</span>
    </div>
  );
}
