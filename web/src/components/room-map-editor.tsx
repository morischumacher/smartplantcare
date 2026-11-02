"use client";

import { useRef, useState, useTransition } from "react";
import { saveFloorPlan, setRoomPhotos, setRoomScan, suggestFloorPlan, type ActionResult } from "@/app/actions";
import { FloorPlanMap, type Selection } from "@/components/floor-plan";
import { FormStatus } from "@/components/form-status";
import { CameraIcon, SparkIcon } from "@/components/icons";
import { uploadPhoto, uploadScan } from "@/lib/image";
import type { Candidate, CandidateSuggestion, FloorPlan, PlantSummary } from "@/lib/types";

type Pos = { x: number; y: number };
type Positions = Record<string, Pos | null>;

const FEATURE_NAMES = { window: "Fenster", door: "Tür", heater: "Heizung" };
type Kind = keyof typeof FEATURE_NAMES;
type Feature = FloorPlan["features"][number];
type Wall = "top" | "right" | "bottom" | "left";
const WALLS: Record<Wall, string> = { top: "oben", right: "rechts", bottom: "unten", left: "links" };

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A feature as a stretch along one of the bounding-box walls, measured from the wall's left/top end. */
function onWall(kind: Kind, wall: Wall, start: number, length: number, plan: FloorPlan): Feature {
  const span = wall === "top" || wall === "bottom" ? plan.width_m : plan.depth_m;
  const a = r2(Math.max(0, Math.min(start, span - 0.2)));
  const b = r2(Math.min(span, a + Math.max(0.2, length)));
  if (wall === "top") return { kind, x1: a, y1: 0, x2: b, y2: 0 };
  if (wall === "bottom") return { kind, x1: a, y1: plan.depth_m, x2: b, y2: plan.depth_m };
  if (wall === "left") return { kind, x1: 0, y1: a, x2: 0, y2: b };
  return { kind, x1: plan.width_m, y1: a, x2: plan.width_m, y2: b };
}

function wallOf(f: Feature, plan: FloorPlan): { wall: Wall; start: number; length: number } | null {
  const eps = 0.05;
  if (Math.abs(f.y1) < eps && Math.abs(f.y2) < eps) return { wall: "top", start: Math.min(f.x1, f.x2), length: Math.abs(f.x2 - f.x1) };
  if (Math.abs(f.y1 - plan.depth_m) < eps && Math.abs(f.y2 - plan.depth_m) < eps) return { wall: "bottom", start: Math.min(f.x1, f.x2), length: Math.abs(f.x2 - f.x1) };
  if (Math.abs(f.x1) < eps && Math.abs(f.x2) < eps) return { wall: "left", start: Math.min(f.y1, f.y2), length: Math.abs(f.y2 - f.y1) };
  if (Math.abs(f.x1 - plan.width_m) < eps && Math.abs(f.x2 - plan.width_m) < eps) return { wall: "right", start: Math.min(f.y1, f.y2), length: Math.abs(f.y2 - f.y1) };
  return null;
}

function rectangle(width: number, depth: number): FloorPlan {
  return {
    width_m: width,
    depth_m: depth,
    outline: [[0, 0], [width, 0], [width, depth], [0, depth]],
    features: [],
    furniture: [],
    source: "manual",
  };
}

export function RoomMapEditor({
  roomId,
  plan,
  plants,
  photos,
  candidates,
  scan,
}: {
  roomId: string;
  plan: FloorPlan | null;
  plants: PlantSummary[];
  photos: { path: string; url: string | null }[];
  candidates: Candidate[];
  scan: { path: string; url: string | null } | null;
}) {
  const initialPositions = () => Object.fromEntries(plants.map((p) => [p.id, p.map]));
  const [draft, setDraft] = useState<FloorPlan | null>(null);
  const [draftCandidates, setDraftCandidates] = useState<CandidateSuggestion[] | null>(null);
  const [positions, setPositions] = useState<Positions>(initialPositions);
  const [selected, setSelected] = useState<Selection>(null);
  const [state, setState] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  const editing = draft !== null;
  const shown = draft ?? plan;

  function edit(p: FloorPlan) {
    setDraft(structuredClone(p));
    setPositions(initialPositions());
    setState(null);
  }
  function cancel() {
    setDraft(null);
    setDraftCandidates(null);
    setSelected(null);
    setPositions(initialPositions());
  }

  function generate() {
    setState(null);
    setBusy("Die KI zeichnet den Grundriss… (dauert etwa eine Minute)");
    start(async () => {
      const res = await suggestFloorPlan(roomId);
      setBusy(null);
      if (!res.ok) return setState({ ok: false, error: res.error });
      setDraft(res.suggestion.floor_plan);
      setDraftCandidates(res.suggestion.candidates);
      const next = initialPositions();
      for (const p of res.suggestion.plants) next[p.plant_id] = { x: p.x, y: p.y };
      setPositions(next);
      const missing = plants.filter((p) => !next[p.id]).length;
      const found = res.suggestion.candidates.length;
      setState({
        ok: true,
        message: [
          "Vorschlag fertig",
          found > 0 && `${found} neue Pflanze(n) entdeckt – nach dem Speichern unten bestätigen`,
          missing > 0 && `${missing} angelegte Pflanze(n) nicht gefunden, bitte platzieren`,
        ].filter(Boolean).join(" · ") + ". Prüfen, anpassen, speichern.",
      });
    });
  }

  function save() {
    if (!draft) return;
    start(async () => {
      const res = await saveFloorPlan({
        roomId,
        floorPlan: { ...draft, generated_at: draft.generated_at ?? new Date().toISOString() },
        positions: plants.map((p) => ({ plantId: p.id, x: positions[p.id]?.x ?? null, y: positions[p.id]?.y ?? null })),
        candidates: draftCandidates ?? undefined,
      });
      setState(res);
      if (res.ok) {
        setDraft(null);
        setDraftCandidates(null);
        setSelected(null);
      }
    });
  }

  function removeSelected() {
    if (!draft || !selected) return;
    const next = structuredClone(draft);
    if (selected.kind === "feature") next.features.splice(selected.index, 1);
    else next.furniture.splice(selected.index, 1);
    setDraft(next);
    setSelected(null);
  }

  const unplaced = plants.filter((p) => !positions[p.id]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="card overflow-hidden p-3 sm:p-5">
          {shown ? (
            <FloorPlanMap
              plan={shown}
              plants={plants}
              candidates={
                draftCandidates
                  ? draftCandidates.map((c, i) => ({ id: String(i), x: c.map_x, y: c.map_y, label: c.common_name_de }))
                  : candidates
                      .filter((c) => c.map_x !== null && c.map_y !== null)
                      .map((c) => ({ id: c.id, x: c.map_x!, y: c.map_y!, label: c.species_guess ?? "?" }))
              }
              positions={positions}
              editable={editing}
              selected={selected}
              onSelect={setSelected}
              onMovePlant={(id, pos) => setPositions((cur) => ({ ...cur, [id]: pos }))}
              onMoveFurniture={(i, pos) =>
                setDraft((cur) => {
                  if (!cur) return cur;
                  const next = structuredClone(cur);
                  next.furniture[i] = {
                    ...next.furniture[i],
                    x: Math.min(pos.x, cur.width_m - next.furniture[i].w),
                    y: Math.min(pos.y, cur.depth_m - next.furniture[i].h),
                  };
                  return next;
                })
              }
            />
          ) : (
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 text-center text-sm text-stone-500">
              <p className="font-medium text-stone-700 dark:text-stone-200">Noch keine Karte</p>
              <p className="max-w-xs">Lade rechts 1–4 Fotos des Raums hoch, die KI zeichnet daraus einen Grundriss. Oder starte mit einem leeren Rechteck.</p>
            </div>
          )}
        </div>

        {editing && (
          <div className="card space-y-3 p-4 text-sm">
            <p className="text-stone-500">Pflanzen und Möbel ziehen, Elemente antippen zum Bearbeiten. „Ab“ zählt von links bzw. oben.</p>
            <AddElements
              onAdd={(el) => {
                const next = structuredClone(draft!);
                if (el === "furniture") {
                  next.furniture.push({ label: "Möbel", x: 0.2, y: r2(Math.max(0, next.depth_m - 0.8)), w: 1, h: 0.6 });
                  setSelected({ kind: "furniture", index: next.furniture.length - 1 });
                } else {
                  // windows and heaters start on the top wall (heaters usually sit under windows), doors on the bottom
                  next.features.push(onWall(el, el === "door" ? "bottom" : "top", next.width_m / 2 - 0.5, el === "door" ? 0.9 : 1.2, next));
                  setSelected({ kind: "feature", index: next.features.length - 1 });
                }
                setDraft(next);
              }}
            />
            {selected && (
              <SelectedPanel
                plan={draft!}
                selected={selected}
                onChange={setDraft}
                onRemove={removeSelected}
              />
            )}
            {unplaced.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-stone-500">Nicht platziert – antippen, um sie in die Mitte zu setzen:</p>
                <div className="flex flex-wrap gap-1.5">
                  {unplaced.map((p) => (
                    <button
                      key={p.id}
                      className="rounded-full bg-stone-100 px-2.5 py-1 text-xs hover:bg-emerald-100 dark:bg-stone-800"
                      onClick={() => setPositions((cur) => ({ ...cur, [p.id]: { x: draft!.width_m / 2, y: draft!.depth_m / 2 } }))}
                    >
                      + {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <SizeFields plan={draft!} onChange={setDraft} />
            <div className="flex gap-2">
              <button className="btn" onClick={save}>Speichern</button>
              <button className="btn-ghost" onClick={cancel}>Abbrechen</button>
            </div>
          </div>
        )}
        {!editing && plan && (
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => edit(plan)}>Karte bearbeiten</button>
          </div>
        )}
        <FormStatus state={state} />
      </div>

      <aside className="space-y-4">
        <RoomPhotos roomId={roomId} photos={photos} />
        <RoomScan roomId={roomId} scan={scan} />
        <div className="card space-y-3 p-4 text-sm">
          <h2 className="font-semibold">Grundriss erstellen</h2>
          <button className="btn w-full" onClick={generate} disabled={(photos.length === 0 && !scan) || busy !== null}>
            <SparkIcon className="size-4" />
            {busy ? "Läuft…" : plan ? "Neu mit KI erstellen" : "Mit KI aus Fotos erstellen"}
          </button>
          {busy && <p className="animate-pulse text-xs text-stone-500">{busy}</p>}
          {photos.length === 0 && <p className="text-xs text-stone-500">Dafür zuerst Raumfotos hochladen.</p>}
          <p className="text-xs text-stone-500">
            Erkennt dabei auch Pflanzen, die noch nicht angelegt sind{scan ? ", und übernimmt die Maße aus dem Scan" : ""}.
          </p>
          {!plan && !editing && <ManualStart onStart={(w, d) => edit(rectangle(w, d))} />}
        </div>
      </aside>
    </div>
  );
}

function AddElements({ onAdd }: { onAdd: (el: Kind | "furniture") => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(["window", "heater", "door"] as const).map((k) => (
        <button key={k} type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => onAdd(k)}>
          + {FEATURE_NAMES[k]}
        </button>
      ))}
      <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => onAdd("furniture")}>
        + Möbel
      </button>
    </div>
  );
}

function SelectedPanel({
  plan,
  selected,
  onChange,
  onRemove,
}: {
  plan: FloorPlan;
  selected: NonNullable<Selection>;
  onChange: (p: FloorPlan) => void;
  onRemove: () => void;
}) {
  const numInput = (value: number, set: (v: number) => void, label: string) => (
    <label className="w-20">
      <span className="label">{label}</span>
      <input
        className="input"
        type="number"
        step="0.1"
        min="0"
        value={r2(value)}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) set(v);
        }}
      />
    </label>
  );

  if (selected.kind === "furniture") {
    const f = plan.furniture[selected.index];
    if (!f) return null;
    const update = (patch: Partial<typeof f>) => {
      const next = structuredClone(plan);
      const m = { ...f, ...patch };
      m.w = r2(Math.max(0.2, Math.min(m.w, plan.width_m - m.x)));
      m.h = r2(Math.max(0.2, Math.min(m.h, plan.depth_m - m.y)));
      next.furniture[selected.index] = m;
      onChange(next);
    };
    return (
      <div className="flex flex-wrap items-end gap-2 rounded-xl bg-stone-50 p-3 dark:bg-stone-800/50">
        <label className="min-w-28 flex-1">
          <span className="label">Möbel</span>
          <input className="input" value={f.label} onChange={(e) => update({ label: e.target.value })} />
        </label>
        {numInput(f.w, (w) => update({ w }), "Breite m")}
        {numInput(f.h, (h) => update({ h }), "Tiefe m")}
        <button className="btn-danger" onClick={onRemove}>Entfernen</button>
      </div>
    );
  }

  const f = plan.features[selected.index];
  if (!f) return null;
  const pos = wallOf(f, plan);
  const set = (patch: Partial<{ kind: Kind; wall: Wall; start: number; length: number }>) => {
    const cur = pos ?? { wall: "top" as Wall, start: 0, length: 1 };
    const v = { kind: f.kind, ...cur, ...patch };
    const next = structuredClone(plan);
    next.features[selected.index] = onWall(v.kind, v.wall, v.start, v.length, plan);
    onChange(next);
  };
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl bg-stone-50 p-3 dark:bg-stone-800/50">
      <label>
        <span className="label">Element</span>
        <select className="input" value={f.kind} onChange={(e) => set({ kind: e.target.value as Kind })}>
          {Object.entries(FEATURE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label>
        <span className="label">Wand</span>
        <select className="input" value={pos?.wall ?? ""} onChange={(e) => set({ wall: e.target.value as Wall })}>
          {!pos && <option value="">schräg</option>}
          {Object.entries(WALLS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      {pos && numInput(pos.start, (start) => set({ start }), "Ab m")}
      {pos && numInput(pos.length, (length) => set({ length }), "Länge m")}
      <button className="btn-danger" onClick={onRemove}>Entfernen</button>
    </div>
  );
}

function SizeFields({ plan, onChange }: { plan: FloorPlan; onChange: (p: FloorPlan) => void }) {
  const rect = plan.outline.length === 4;
  return (
    <div className="flex items-end gap-2">
      {(["width_m", "depth_m"] as const).map((k) => (
        <label key={k} className="flex-1">
          <span className="label">{k === "width_m" ? "Breite (m)" : "Tiefe (m)"}</span>
          <input
            className="input"
            type="number"
            step="0.1"
            min="1"
            max="30"
            value={plan[k]}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!(v >= 1 && v <= 30)) return;
              const next = { ...plan, [k]: v };
              if (rect && plan.source === "manual") next.outline = rectangle(next.width_m, next.depth_m).outline;
              onChange(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}

function ManualStart({ onStart }: { onStart: (w: number, d: number) => void }) {
  const [w, setW] = useState("4");
  const [d, setD] = useState("3.5");
  return (
    <div className="border-t border-stone-100 pt-3 dark:border-stone-800">
      <p className="mb-2 text-xs text-stone-500">Oder ohne KI: Rechteck mit Maßen</p>
      <div className="flex gap-2">
        <input className="input" value={w} onChange={(e) => setW(e.target.value)} aria-label="Breite in m" />
        <span className="self-center text-stone-400">×</span>
        <input className="input" value={d} onChange={(e) => setD(e.target.value)} aria-label="Tiefe in m" />
        <button className="btn-ghost" onClick={() => onStart(Number(w.replace(",", ".")) || 4, Number(d.replace(",", ".")) || 3.5)}>
          Los
        </button>
      </div>
    </div>
  );
}

function RoomPhotos({ roomId, photos }: { roomId: string; photos: { path: string; url: string | null }[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    start(async () => {
      try {
        const room = photos.map((p) => p.path);
        for (const f of Array.from(files).slice(0, 4 - room.length)) room.push(await uploadPhoto(f, `rooms/${roomId}`));
        const res = await setRoomPhotos(roomId, room);
        if (!res.ok) setError(res.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload fehlgeschlagen");
      } finally {
        setBusy(false);
        if (input.current) input.current.value = "";
      }
    });
  }

  return (
    <div className="card space-y-3 p-4 text-sm">
      <h2 className="font-semibold">Raumfotos</h2>
      <p className="text-xs text-stone-500">
        Aus mehreren Ecken fotografieren, sodass Fenster, Heizung und die Pflanzen zu sehen sind. Die Fotos dienen nur zum Erkennen
        des Grundrisses.
      </p>
      <div className="grid grid-cols-4 gap-2">
        {photos.map((p) => (
          <div key={p.path} className="group relative">
            {p.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.url} alt="" className="aspect-square w-full rounded-lg object-cover" />
            )}
            <button
              className="absolute top-0.5 right-0.5 hidden size-5 rounded-full bg-black/60 text-xs text-white group-hover:block [@media(hover:none)]:block"
              onClick={() => start(async () => void (await setRoomPhotos(roomId, photos.filter((x) => x.path !== p.path).map((x) => x.path))))}
              aria-label="Foto entfernen"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {photos.length < 4 && (
        <>
          <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => add(e.target.files)} />
          <button className="btn-ghost w-full" onClick={() => input.current?.click()} disabled={busy}>
            <CameraIcon className="size-4" /> {busy ? "Lade hoch…" : "Fotos hinzufügen"}
          </button>
        </>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

/** Floor plan exported by an iPhone LiDAR scan app (PDF or image); gives plan-room exact dimensions. */
function RoomScan({ roomId, scan }: { roomId: string; scan: { path: string; url: string | null } | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const isPdf = scan?.path.endsWith(".pdf");

  function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    start(async () => {
      try {
        const res = await setRoomScan(roomId, await uploadScan(file, `rooms/${roomId}/scan`));
        if (!res.ok) setError(res.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload fehlgeschlagen");
      } finally {
        setBusy(false);
        if (input.current) input.current.value = "";
      }
    });
  }

  return (
    <div className="card space-y-3 p-4 text-sm">
      <h2 className="font-semibold">iPhone-Scan <span className="font-normal text-stone-400">(optional)</span></h2>
      <p className="text-xs text-stone-500">
        Grundriss aus einer LiDAR-App (z. B. ezSpace, Polycam, magicplan) als PDF, Bild oder Screenshot. Wände, Fenster, Türen
        und Maße kommen dann exakt aus dem Scan, Heizungen und Pflanzen aus den Fotos.
      </p>
      {scan && (
        <div className="flex items-center gap-2">
          {isPdf ? (
            <a href={scan.url ?? "#"} target="_blank" rel="noreferrer" className="rounded-lg bg-stone-100 px-3 py-2 text-xs underline dark:bg-stone-800">
              Scan (PDF) öffnen
            </a>
          ) : (
            scan.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={scan.url} alt="Scan" className="h-16 rounded-lg object-contain" />
            )
          )}
          <button className="btn-danger ml-auto" onClick={() => start(async () => void (await setRoomScan(roomId, null)))}>
            Entfernen
          </button>
        </div>
      )}
      <input ref={input} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      <button className="btn-ghost w-full" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? "Lade hoch…" : scan ? "Scan ersetzen" : "Scan hochladen"}
      </button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
