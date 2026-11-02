// Derives an abstract top-down floor plan of a room from 1–4 room photos, including windows,
// doors, heaters, large furniture and where each plant of the room stands.
//
// POST /functions/v1/plan-room
// Header: Authorization: Bearer <user access token>
// Body:   { "room_id": "<rooms.id>" }
//
// Uses rooms.photo_paths and, as reference, the latest diary photo of each plant in the room.
// Returns a suggestion; the web app shows it and saves floor_plan and plant positions on confirm.

import Anthropic from "npm:@anthropic-ai/sdk@1";
import { createClient } from "npm:@supabase/supabase-js@2";
import { HttpError, isSignedIn, json, loadImage } from "../_shared/images.ts";

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
Lege die Wand mit dem größten Fenster nach oben (y = 0).

- Schätze Breite und Tiefe des Raums anhand bekannter Größen (Tür ca. 0,9 m breit und 2 m hoch,
  Steckdose ca. 30 cm über dem Boden, Fensterbank ca. 90 cm hoch, Raumhöhe ca. 2,5 m).
- outline: Umriss als Polygon im Uhrzeigersinn; bei einem rechteckigen Raum die vier Ecken.
- features: Fenster, Türen und Heizkörper als Strecke entlang der Wand, an der sie sitzen.
- furniture: nur große Möbel (Sofa, Tisch, Bett, Regal, Schrank) als Rechtecke mit kurzem deutschem Namen.
- plants: Standort jeder Pflanze (Mitte des Topfs) anhand der Referenzfotos. Ist eine Pflanze
  nicht sicher zu erkennen, setze found auf false.
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
          },
          required: ["label", "x", "y", "w", "h"],
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
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["plant_id", "found", "x", "y", "confidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["width_m", "depth_m", "outline", "features", "furniture", "plants"],
    additionalProperties: false,
  };
}

type Plan = {
  width_m: number;
  depth_m: number;
  outline: { x: number; y: number }[];
  features: { kind: string; x1: number; y1: number; x2: number; y2: number }[];
  furniture: { label: string; x: number; y: number; w: number; h: number }[];
  plants: { plant_id: string; found: boolean; x: number; y: number; confidence: string }[];
};

const round = (v: number) => Math.round(v * 100) / 100;

/** Clamps everything into the room's bounding box; Claude's estimates can overshoot. */
function normalize(plan: Plan) {
  const w = Math.min(Math.max(plan.width_m, 1), 30);
  const d = Math.min(Math.max(plan.depth_m, 1), 30);
  const cx = (v: number) => round(Math.min(w, Math.max(0, v)));
  const cy = (v: number) => round(Math.min(d, Math.max(0, v)));
  const outline = plan.outline.length >= 3
    ? plan.outline.map((p) => [cx(p.x), cy(p.y)])
    : [[0, 0], [w, 0], [w, d], [0, d]];
  return {
    floor_plan: {
      width_m: round(w),
      depth_m: round(d),
      outline,
      features: plan.features.map((f) => ({ kind: f.kind, x1: cx(f.x1), y1: cy(f.y1), x2: cx(f.x2), y2: cy(f.y2) })),
      furniture: plan.furniture.map((f) => ({
        label: f.label,
        x: cx(f.x),
        y: cy(f.y),
        w: round(Math.min(Math.max(f.w, 0.2), w - cx(f.x))),
        h: round(Math.min(Math.max(f.h, 0.2), d - cy(f.y))),
      })),
      source: "ai",
      generated_at: new Date().toISOString(),
    },
    plants: plan.plants.filter((p) => p.found).map((p) => ({
      plant_id: p.plant_id,
      x: cx(p.x),
      y: cy(p.y),
      confidence: p.confidence,
    })),
  };
}

async function planRoom(roomId: string) {
  const { data: room, error } = await supabase.from("rooms").select("id, name, photo_paths").eq("id", roomId).maybeSingle();
  if (error) throw error;
  if (!room) throw new HttpError(404, "room not found");
  const roomPhotos = (room.photo_paths as string[]).slice(0, MAX_ROOM_PHOTOS);
  if (roomPhotos.length === 0) throw new HttpError(400, "room has no photos");

  const { data: plants, error: plantsError } = await supabase
    .from("plants")
    .select("id, name, species, plant_photos(storage_path, taken_at)")
    .eq("room_id", roomId)
    .is("archived_at", null)
    .order("taken_at", { referencedTable: "plant_photos", ascending: false })
    .limit(1, { referencedTable: "plant_photos" });
  if (plantsError) throw plantsError;

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const [i, path] of roomPhotos.entries()) {
    content.push({ type: "text", text: `Raum „${room.name}“, Foto ${i + 1} von ${roomPhotos.length}:` });
    content.push({ type: "image", source: { type: "base64", ...(await loadImage(supabase, path)) } });
  }
  content.push({ type: "text", text: plants.length > 0 ? "Pflanzen in diesem Raum:" : "Diesem Raum sind noch keine Pflanzen zugeordnet." });
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
  return normalize(JSON.parse(text.text) as Plan);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  if (!(await isSignedIn(supabase, req))) return json(401, { error: "unauthorized" });

  let roomId: unknown;
  try {
    roomId = (await req.json()).room_id;
  } catch {
    return json(400, { error: "invalid JSON" });
  }
  if (typeof roomId !== "string") return json(400, { error: "room_id required" });

  try {
    return json(200, await planRoom(roomId));
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
