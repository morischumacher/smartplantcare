// Derives an abstract top-down floor plan of a room, including windows, doors, heaters, large
// furniture and where each plant stands – and spots plants that are not set up in the app yet.
//
// POST /functions/v1/plan-room
// Header: Authorization: Bearer <user access token>
// Body:   { "room_id": "<rooms.id>", "mode"?: "plan" | "plants" }
//         mode "plants" only looks for plants again and keeps the saved floor plan unchanged.
//
// Inputs, all from the plant-photos bucket:
// - rooms.scan_plan (optional): exact geometry from an IFC scan, already in floor_plan format.
//   Kept unchanged; Claude only adds heaters, plants and – if the scan has none – furniture.
// - rooms.scan_path (optional): floor plan exported by an iPhone LiDAR scan app (PDF or image).
//   If present, walls, windows, doors and dimensions are taken from it exactly.
// - rooms.photo_paths (1–4): room photos – heaters, plants, light and anything the scan lacks.
// - the latest diary photo of each plant of the room, to recognise it.
// Returns a suggestion; the web app shows it and saves floor plan, positions and candidates on confirm.

import Anthropic from "npm:@anthropic-ai/sdk@1";
import { createClient } from "npm:@supabase/supabase-js@2";
import { HttpError, isSignedIn, json, loadImage, loadScan } from "../_shared/images.ts";
import { dedupeDetections } from "../_shared/candidates.ts";
import { matchSpecies } from "../_shared/species.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const MODEL = "claude-opus-5-5";
const MAX_ROOM_PHOTOS = 4;
const MAX_REFERENCE_PHOTOS = 10;

const SYSTEM = `Du erstellst aus Fotos eines Raums einen vereinfachten Grundriss von oben, wie bei einer
Saugroboter-Karte. Koordinaten in Metern, Ursprung oben links, x nach rechts, y nach unten.

Grundriss:
- Liegt ein exakter Grundriss als JSON bei (aus einem IFC-Scan oder bereits gespeichert), ist er verbindlich: gib Maße, Umriss,
  Fenster und Türen unverändert zurück und verwende genau sein Koordinatensystem. Ergänze Heizkörper,
  und Möbel nur, wenn das JSON keine enthält.
- Liegt ein Scan-Grundriss (aus einer LiDAR-App) bei, übernimm Umriss, Maße, Fenster und Türen exakt
  daraus, in seiner Ausrichtung. Die Fotos ergänzen, was der Scan nicht zeigt (vor allem Heizkörper
  und Pflanzen) und helfen, die Fotos im Grundriss zu verorten.
- Ohne Scan: Lege die Wand mit dem größten Fenster nach oben (y = 0) und schätze Breite und Tiefe anhand
  bekannter Größen (Tür ca. 0,9 m breit und 2 m hoch, Steckdose ca. 30 cm über dem Boden, Fensterbank
  ca. 90 cm hoch, Raumhöhe ca. 2,5 m).
- outline: Umriss als Polygon im Uhrzeigersinn; bei einem rechteckigen Raum die vier Ecken.
- features: Fenster, Türen und Heizkörper als Strecke entlang der Wand, an der sie sitzen.
- furniture: nur große Möbel (Sofa, Tisch, Bett, Regal, Schrank) als Rechtecke mit kurzem deutschem Namen
  und ihrer Höhe (height_m) – darauf stehende Pflanzen haben dann ungefähr diese Höhe.

Pflanzen:
- plants: Standort jeder bereits angelegten Pflanze (Mitte des Topfs), erkannt anhand der Referenzfotos.
  Ist eine nicht sicher zu erkennen, setze found auf false.
- new_plants: alle weiteren Topfpflanzen auf den Fotos, die keiner angelegten Pflanze entsprechen.
  Dieselbe Pflanze ist meist auf mehreren Fotos aus verschiedenen Blickwinkeln zu sehen: Ordne zuerst
  jede Pflanze einem Standort im Grundriss zu (anhand von Möbeln, Fenstern, Topf und Wuchsform) und
  führe alle Ansichten desselben Standorts zu EINEM Eintrag zusammen; seen_on listet alle Fotos, auf
  denen sie zu sehen ist. Zwei Einträge nur, wenn wirklich zwei Töpfe an verschiedenen Stellen stehen. Nenne die Art (wissenschaftlicher
  Name, aktuelle Nomenklatur, bevorzugt eine aus der Artenliste) und wie sicher du bist: "high" nur bei
  eindeutigen Merkmalen, "low" wenn die Pflanze klein, verdeckt oder unscharf ist. photo_index ist das Foto,
  auf dem sie am besten zu sehen ist, box ihr Bereich darauf als Anteil von Breite und Höhe (0–1).
  Schnittblumen, Kunstpflanzen und Pflanzen draußen vor dem Fenster zählen nicht.
- height_m: Höhe des Topfbodens über dem Fußboden in Metern (Boden 0, Couchtisch ca. 0,45, Fensterbank
  ca. 0,9, Regalbrett oder Schrankfach entsprechend). Pflanzen übereinander im selben Regal oder Schrank
  stehen am selben Punkt im Grundriss, aber auf verschiedenen Höhen – das sind verschiedene Pflanzen.

Die Fotos zeigen denselben Raum aus verschiedenen Blickwinkeln; führe sie zu einem Grundriss zusammen.
Ein grober, aber stimmiger Grundriss ist besser als Details, die nicht zu erkennen sind.`;

const point = {
  type: "object",
  properties: { x: { type: "number" }, y: { type: "number" } },
  required: ["x", "y"],
  additionalProperties: false,
};

function schema(plantIds: string[]) {
  return {
    type: "object",
    properties: {
      width_m: { type: "number" },
      depth_m: { type: "number" },
      outline: { type: "array", items: point },
      features: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["window", "door", "heater"] },
            x1: { type: "number" },
            y1: { type: "number" },
            x2: { type: "number" },
            y2: { type: "number" },
          },
          required: ["kind", "x1", "y1", "x2", "y2"],
          additionalProperties: false,
        },
      },
      furniture: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            x: { type: "number" },
            y: { type: "number" },
            w: { type: "number" },
            h: { type: "number" },
            height_m: { type: "number", description: "wie hoch das Möbel ist, in Metern" },
          },
          required: ["label", "x", "y", "w", "h", "height_m"],
          additionalProperties: false,
        },
      },
      plants: {
        type: "array",
        items: {
          type: "object",
          properties: {
            plant_id: plantIds.length > 0 ? { type: "string", enum: plantIds } : { type: "string" },
            found: { type: "boolean" },
            x: { type: "number" },
            y: { type: "number" },
            height_m: { type: "number" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["plant_id", "found", "x", "y", "height_m", "confidence"],
          additionalProperties: false,
        },
      },
      new_plants: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string", description: "kurz auf Deutsch, wo und wie sie aussieht" },
            species_guess: { type: "string" },
            common_name_de: { type: "string" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            x: { type: "number" },
            y: { type: "number" },
            height_m: { type: "number" },
            photo_index: { type: "integer" },
            seen_on: { type: "array", items: { type: "integer" } },
            box: {
              type: "object",
              properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } },
              required: ["x", "y", "w", "h"],
              additionalProperties: false,
            },
          },
          required: ["description", "species_guess", "common_name_de", "confidence", "x", "y", "height_m", "photo_index", "seen_on", "box"],
          additionalProperties: false,
        },
      },
    },
    required: ["width_m", "depth_m", "outline", "features", "furniture", "plants", "new_plants"],
    additionalProperties: false,
  };
}

type Box = { x: number; y: number; w: number; h: number };
type Plan = {
  width_m: number;
  depth_m: number;
  outline: { x: number; y: number }[];
  features: { kind: string; x1: number; y1: number; x2: number; y2: number }[];
  furniture: { label: string; x: number; y: number; w: number; h: number; height_m: number }[];
  plants: { plant_id: string; found: boolean; x: number; y: number; height_m: number; confidence: string }[];
  new_plants: {
    description: string;
    species_guess: string;
    common_name_de: string;
    confidence: "high" | "medium" | "low";
    x: number;
    y: number;
    height_m: number;
    photo_index: number;
    seen_on: number[];
    box: Box;
  }[];
};

const round = (v: number) => Math.round(v * 100) / 100;
const level = (v: number) => round(Math.min(3, Math.max(0, v)));
const unit = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
const INSET = 0.05; // keep furniture off the wall line so labels stay readable

/** Clamps everything into the room's bounding box; Claude's estimates can overshoot. */
function normalize(
  plan: Plan,
  roomPhotos: string[],
  species: { id: string; scientific_name: string; common_name_de: string; aliases: string[] }[],
  known: { species_id: string | null; map_x: number | null; map_y: number | null; map_height_m: number | null; id?: string }[],
) {
  const w = Math.min(Math.max(plan.width_m, 1), 30);
  const d = Math.min(Math.max(plan.depth_m, 1), 30);
  const cx = (v: number) => round(Math.min(w, Math.max(0, v)));
  const cy = (v: number) => round(Math.min(d, Math.max(0, v)));
  const outline = plan.outline.length >= 3
    ? plan.outline.map((p) => [cx(p.x), cy(p.y)])
    : [[0, 0], [w, 0], [w, d], [0, d]];
  const found = plan.plants.filter((p) => p.found).map((p) => ({ plant_id: p.plant_id, x: cx(p.x), y: cy(p.y), height_m: level(p.height_m), confidence: p.confidence }));
  // Plants already set up (where Claude found them now, else where they stand on the saved map)
  // and detections dismissed earlier: neither is suggested again.
  const knownSpots = known.flatMap((k) => {
    const f = found.find((p) => p.plant_id === k.id);
    const saved = k.map_x !== null && k.map_y !== null
      ? { x: Number(k.map_x), y: Number(k.map_y), height_m: k.map_height_m === null ? null : Number(k.map_height_m) }
      : null;
    const pos = f ?? saved;
    return pos ? [{ species_id: k.species_id, x: pos.x, y: pos.y, height_m: pos.height_m }] : [];
  });
  return {
    floor_plan: {
      width_m: round(w),
      depth_m: round(d),
      outline,
      features: plan.features.map((f) => ({ kind: f.kind, x1: cx(f.x1), y1: cy(f.y1), x2: cx(f.x2), y2: cy(f.y2) })),
      furniture: plan.furniture.map((f) => {
        const x = round(Math.min(Math.max(f.x, INSET), w - INSET - 0.2));
        const y = round(Math.min(Math.max(f.y, INSET), d - INSET - 0.2));
        return {
          label: f.label,
          x,
          y,
          w: round(Math.min(Math.max(f.w, 0.2), w - INSET - x)),
          h: round(Math.min(Math.max(f.h, 0.2), d - INSET - y)),
          height_m: f.height_m > 0 ? level(f.height_m) : null,
        };
      }),
      source: "ai",
      generated_at: new Date().toISOString(),
    },
    plants: found,
    candidates: dedupeDetections(plan.new_plants.map((p) => {
      const photo = roomPhotos[Math.min(Math.max(p.photo_index, 1), roomPhotos.length) - 1];
      const bx = unit(p.box.x);
      const by = unit(p.box.y);
      const match = matchSpecies(p.species_guess, species) ?? matchSpecies(p.common_name_de, species);
      return {
        description: p.description,
        species_guess: p.species_guess,
        common_name_de: match?.common_name_de ?? p.common_name_de,
        species_id: match?.id ?? null,
        confidence: p.confidence,
        map_x: cx(p.x),
        map_y: cy(p.y),
        height_m: level(p.height_m),
        photo_path: photo,
        seen_on: p.seen_on.length > 0 ? p.seen_on : [p.photo_index],
        box: { x: bx, y: by, w: unit(Math.min(p.box.w, 1 - bx)), h: unit(Math.min(p.box.h, 1 - by)) },
      };
    }), knownSpots),
  };
}

async function planRoom(roomId: string, mode: "plan" | "plants") {
  const { data: room, error } = await supabase
    .from("rooms")
    .select("id, name, photo_paths, scan_path, scan_plan, floor_plan")
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw error;
  if (!room) throw new HttpError(404, "room not found");
  const roomPhotos = (room.photo_paths as string[]).slice(0, MAX_ROOM_PHOTOS);
  if (roomPhotos.length === 0 && !room.scan_path && !room.scan_plan) throw new HttpError(400, "room has no photos or scan");
  if (mode === "plants" && (roomPhotos.length === 0 || !room.floor_plan)) throw new HttpError(400, "room needs photos and a floor plan");

  const { data: plants, error: plantsError } = await supabase
    .from("plants")
    .select("id, name, species, species_id, map_x, map_y, map_height_m, plant_photos(storage_path, taken_at)")
    .eq("room_id", roomId)
    .is("archived_at", null)
    .order("taken_at", { referencedTable: "plant_photos", ascending: false })
    .limit(1, { referencedTable: "plant_photos" });
  if (plantsError) throw plantsError;
  const { data: species, error: speciesError } = await supabase.from("species").select("id, scientific_name, common_name_de, aliases");
  if (speciesError) throw speciesError;
  const { data: dismissed, error: dismissedError } = await supabase
    .from("plant_candidates")
    .select("species_id, map_x, map_y, map_height_m")
    .eq("room_id", roomId)
    .eq("status", "dismissed");
  if (dismissedError) throw dismissedError;

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  // In plants mode the saved plan is binding, just like an IFC scan.
  const savedPlan = mode === "plants" ? (room.floor_plan as ScanPlan) : null;
  const scanPlan = savedPlan ?? (room.scan_plan as ScanPlan | null);
  if (scanPlan) {
    const { source: _s, generated_at: _g, ...geometry } = scanPlan;
    content.push({
      type: "text",
      text: `Exakter Grundriss ${savedPlan ? "(gespeichert)" : "aus dem IFC-Scan"} (Meter, Ursprung oben links):\n${JSON.stringify(geometry)}`,
    });
  }
  if (room.scan_path && !savedPlan) {
    content.push({ type: "text", text: "Scan-Grundriss aus einer LiDAR-App (Maße und Wände exakt übernehmen):" });
    content.push(await loadScan(supabase, room.scan_path));
  }
  for (const [i, path] of roomPhotos.entries()) {
    content.push({ type: "text", text: `Raum „${room.name}“, Foto ${i + 1} von ${roomPhotos.length}:` });
    content.push({ type: "image", source: { type: "base64", ...(await loadImage(supabase, path)) } });
  }
  content.push({ type: "text", text: plants.length > 0 ? "Bereits angelegte Pflanzen in diesem Raum:" : "In diesem Raum sind noch keine Pflanzen angelegt." });
  let references = 0;
  for (const p of plants) {
    const label = `plant_id ${p.id}: ${p.name}${p.species ? ` (${p.species})` : ""}`;
    const ref = (p.plant_photos as { storage_path: string }[])[0];
    if (ref && references < MAX_REFERENCE_PHOTOS) {
      content.push({ type: "text", text: `${label}, Referenzfoto:` });
      content.push({ type: "image", source: { type: "base64", ...(await loadImage(supabase, ref.storage_path)) } });
      references++;
    } else {
      content.push({ type: "text", text: `${label} (kein Referenzfoto, anhand der Art erkennen)` });
    }
  }
  content.push({ type: "text", text: `Artenliste: ${species.map((s) => `${s.scientific_name} (${s.common_name_de})`).join("; ")}` });

  const response = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: "high", format: { type: "json_schema", schema: schema(plants.map((p) => p.id)) } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") throw new HttpError(422, "declined by the model");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error(`no text in response (stop_reason ${response.stop_reason})`);
  const result = normalize(JSON.parse(text.text) as Plan, roomPhotos, species, [...plants, ...dismissed]);
  if (savedPlan) return { ...result, floor_plan: savedPlan };
  return scanPlan ? { ...result, floor_plan: mergeScan(scanPlan, result.floor_plan) } : result;
}

type ScanPlan = {
  width_m: number;
  depth_m: number;
  outline: number[][];
  features: { kind: string; x1: number; y1: number; x2: number; y2: number }[];
  furniture: { label: string; x: number; y: number; w: number; h: number }[];
  source: string;
  generated_at?: string;
};

/** Scan geometry wins; from Claude's plan only heaters (and furniture if the scan has none). */
function mergeScan(scan: ScanPlan, ai: ReturnType<typeof normalize>["floor_plan"]) {
  return {
    width_m: scan.width_m,
    depth_m: scan.depth_m,
    outline: scan.outline,
    features: [...scan.features.filter((f) => f.kind !== "heater"), ...ai.features.filter((f) => f.kind === "heater")],
    furniture: scan.furniture.length > 0 ? scan.furniture : ai.furniture,
    source: "scan",
    generated_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  if (!(await isSignedIn(supabase, req))) return json(401, { error: "unauthorized" });

  let roomId: unknown;
  let mode: unknown;
  try {
    ({ room_id: roomId, mode } = await req.json());
  } catch {
    return json(400, { error: "invalid JSON" });
  }
  if (typeof roomId !== "string") return json(400, { error: "room_id required" });
  if (mode !== undefined && mode !== "plan" && mode !== "plants") return json(400, { error: "mode must be plan or plants" });

  try {
    return json(200, await planRoom(roomId, mode ?? "plan"));
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    if (e instanceof Anthropic.RateLimitError) return json(503, { error: "AI rate limit, try again later" });
    if (e instanceof Anthropic.APIError) {
      console.error("anthropic error", e.status, e.message);
      return json(502, { error: "AI request failed" });
    }
    console.error("plan-room failed", e);
    return json(500, { error: "internal error" });
  }
});
