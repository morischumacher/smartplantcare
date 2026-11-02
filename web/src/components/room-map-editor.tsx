"use client";

import { useRef, useState, useTransition } from "react";
import { saveFloorPlan, setRoomPhotos, suggestFloorPlan, type ActionResult } from "@/app/actions";
import { FloorPlanMap, type Selection } from "@/components/floor-plan";
import { FormStatus } from "@/components/form-status";
import { CameraIcon, SparkIcon } from "@/components/icons";
import { uploadPhoto } from "@/lib/image";
import type { FloorPlan, PlantSummary } from "@/lib/types";

type Pos = { x: number; y: number };
type Positions = Record<string, Pos | null>;

const FEATURE_NAMES = { window: "Fenster", door: "Tür", heater: "Heizung" };

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
}: {
  roomId: string;
  plan: FloorPlan | null;
  plants: PlantSummary[];
  photos: { path: string; url: string | null }[];
}) {
  const initialPositions = () => Object.fromEntries(plants.map((p) => [p.id, p.map]));
  const [draft, setDraft] = useState<FloorPlan | null>(null);
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
      const next = initialPositions();
      for (const p of res.suggestion.plants) next[p.plant_id] = { x: p.x, y: p.y };
      setPositions(next);
      const missing = plants.filter((p) => !next[p.id]).length;
      setState({
        ok: true,
        message: `Vorschlag fertig${missing ? ` – ${missing} Pflanze(n) nicht erkannt, bitte unten platzieren` : ""}. Prüfen, anpassen, speichern.`,
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
      });
      setState(res);
      if (res.ok) {
        setDraft(null);
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
            <p className="text-stone-500">Pflanzen und Möbel ziehen, Fenster/Türen/Heizungen antippen zum Auswählen.</p>
            {selected && (
              <div className="flex items-center gap-2">
                <span>
                  Ausgewählt:{" "}
                  {selected.kind === "feature" ? FEATURE_NAMES[draft!.features[selected.index].kind] : draft!.furniture[selected.index].label}
                </span>
                <button className="btn-danger" onClick={removeSelected}>Entfernen</button>
              </div>
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
        <div className="card space-y-3 p-4 text-sm">
          <h2 className="font-semibold">Grundriss erstellen</h2>
          <button className="btn w-full" onClick={generate} disabled={photos.length === 0 || busy !== null}>
            <SparkIcon className="size-4" />
            {busy ? "Läuft…" : plan ? "Neu mit KI erstellen" : "Mit KI aus Fotos erstellen"}
          </button>
          {busy && <p className="animate-pulse text-xs text-stone-500">{busy}</p>}
          {photos.length === 0 && <p className="text-xs text-stone-500">Dafür zuerst Raumfotos hochladen.</p>}
          {!plan && !editing && <ManualStart onStart={(w, d) => edit(rectangle(w, d))} />}
        </div>
      </aside>
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
