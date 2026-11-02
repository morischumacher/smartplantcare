// AI health check for a plant photo with Claude (vision), compared to the previous photo.
//
// POST /functions/v1/analyze-photo
// Header: Authorization: Bearer <user access token>   (signed-in user of the web app)
// Body:   { "photo_id": "<plant_photos.id>" }
//
// The web app uploads the image to the `plant-photos` bucket, inserts the plant_photos row and
// then calls this function. The result is stored in plant_photos.analysis and shown as a hint.

import Anthropic from "npm:@anthropic-ai/sdk@1";
import { createClient } from "npm:@supabase/supabase-js@2";
import { HttpError, isSignedIn, json, loadImage } from "../_shared/images.ts";
import { seasonOf } from "../_shared/watering.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const MODEL = "claude-opus-5-5";
const SEASON_DE = { winter: "Winter", spring: "Frühling", summer: "Sommer", autumn: "Herbst" };

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    health: { type: "string", enum: ["good", "fair", "poor"] },
    summary: { type: "string", description: "1–2 Sätze auf Deutsch, wie es der Pflanze geht." },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["yellow_leaves", "brown_tips", "drooping", "pests", "mold", "sunburn", "leggy_growth", "root_rot_signs", "other"],
          },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          description: { type: "string" },
        },
        required: ["type", "severity", "description"],
        additionalProperties: false,
      },
    },
    watering_assessment: { type: "string", enum: ["too_dry", "ok", "too_wet", "unclear"] },
    light_assessment: { type: "string", enum: ["too_little", "ok", "too_much", "unclear"] },
    growth_vs_previous: { type: "string", enum: ["more", "same", "less", "no_previous", "unclear"] },
    recommendations: { type: "array", items: { type: "string" } },
    species_guess: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["health", "summary", "issues", "watering_assessment", "light_assessment", "growth_vs_previous", "recommendations", "species_guess"],
  additionalProperties: false,
};

const SYSTEM = `Du bist Experte für Zimmerpflanzen und beurteilst Fotos aus einem Pflanzen-Monitoring.
Beurteile Gesundheit, sichtbare Probleme, ob die Pflanze eher zu trocken oder zu nass wirkt, das Licht,
und – falls ein früheres Foto dabei ist – das Wachstum seitdem. Beziehe die Sensordaten ein, aber
widersprich ihnen, wenn das Foto etwas anderes zeigt. Sei konkret und knapp; schreibe alle Texte auf Deutsch.
Wenn etwas auf dem Foto nicht zu erkennen ist, nutze "unclear" statt zu raten.`;

async function sensorContext(plantId: string): Promise<string> {
  const { data: plant } = await supabase
    .from("plants")
    .select("name, species, moisture_min, moisture_max, rooms(name, humidity_min, humidity_max)")
    .eq("id", plantId)
    .single();
  const { data: pot } = await supabase
    .from("pots")
    .select("started_at, volume_l, soil_type")
    .eq("plant_id", plantId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: links } = await supabase.from("plant_sensors").select("sensor_id").eq("plant_id", plantId);
  const { data: latest } = await supabase
    .from("sensor_latest")
    .select("moisture, temperature, light, conductivity")
    .in("sensor_id", (links ?? []).map((l) => l.sensor_id));

  const room = plant?.rooms as unknown as { name: string } | null;
  const lines = [
    `Pflanze: ${plant?.name ?? "?"}${plant?.species ? ` (${plant.species})` : ""}`,
    `Jahreszeit: ${SEASON_DE[seasonOf(Date.now())]}`,
    room ? `Raum: ${room.name}` : null,
    pot ? `Topf: ${pot.volume_l ?? "?"} l, Erde ${pot.soil_type}, seit ${pot.started_at.slice(0, 10)}` : null,
    plant ? `Zielbereich Bodenfeuchte: ${plant.moisture_min}–${plant.moisture_max} %` : null,
  ];
  for (const r of latest ?? []) {
    lines.push(`Aktuell: Feuchte ${r.moisture ?? "?"} %, ${r.temperature ?? "?"} °C, Licht ${r.light ?? "?"} lx, Leitfähigkeit ${r.conductivity ?? "?"} µS/cm`);
  }
  return lines.filter(Boolean).join("\n");
}

async function analyze(photoId: string) {
  const { data: photo, error } = await supabase
    .from("plant_photos")
    .select("id, plant_id, taken_at, storage_path")
    .eq("id", photoId)
    .maybeSingle();
  if (error) throw error;
  if (!photo) throw new HttpError(404, "photo not found");

  const { data: previous } = await supabase
    .from("plant_photos")
    .select("taken_at, storage_path, analysis")
    .eq("plant_id", photo.plant_id)
    .lt("taken_at", photo.taken_at)
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [current, before, context] = await Promise.all([
    loadImage(supabase, photo.storage_path),
    previous ? loadImage(supabase, previous.storage_path) : Promise.resolve(null),
    sensorContext(photo.plant_id),
  ]);

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (before && previous) {
    content.push({ type: "text", text: `Früheres Foto vom ${previous.taken_at.slice(0, 10)}:` });
    content.push({ type: "image", source: { type: "base64", ...before } });
  }
  content.push({ type: "text", text: `Aktuelles Foto vom ${photo.taken_at.slice(0, 10)}:` });
  content.push({ type: "image", source: { type: "base64", ...current } });
  content.push({ type: "text", text: `Sensordaten:\n${context}\n\nBeurteile die Pflanze auf dem aktuellen Foto.` });

  const response = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: ANALYSIS_SCHEMA } },
    // Re-runs the request on Anthropic's recommended model if a safety classifier declines it.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") throw new HttpError(422, "analysis declined by the model");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error(`no text in response (stop_reason ${response.stop_reason})`);

  const analysis = {
    ...JSON.parse(text.text),
    model: response.model,
    analyzed_at: new Date().toISOString(),
    compared_with_previous: Boolean(before),
  };
  const { error: updateError } = await supabase.from("plant_photos").update({ analysis }).eq("id", photo.id);
  if (updateError) throw updateError;
  return analysis;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  if (!(await isSignedIn(supabase, req))) return json(401, { error: "unauthorized" });

  let photoId: unknown;
  try {
    photoId = (await req.json()).photo_id;
  } catch {
    return json(400, { error: "invalid JSON" });
  }
  if (typeof photoId !== "string") return json(400, { error: "photo_id required" });

  try {
    return json(200, await analyze(photoId));
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    if (e instanceof Anthropic.RateLimitError) return json(503, { error: "AI rate limit, try again later" });
    if (e instanceof Anthropic.APIError) {
      console.error("anthropic error", e.status, e.message);
      return json(502, { error: "AI analysis failed" });
    }
    console.error("analyze-photo failed", e);
    return json(500, { error: "internal error" });
  }
});
