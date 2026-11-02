// Plant species: identify a plant from a photo, create missing species profiles, fetch example images.
//
// POST /functions/v1/plant-species
// Header: Authorization: Bearer <user access token>
// Body, one of:
//   { "action": "identify", "photo_path": "<path in plant-photos>" }
//       → { guess, confidence, alternatives, species }   (species = matched or newly created row, or null)
//   { "action": "ensure", "name": "Calathea orbifolia" }
//       → { species }   (existing match, otherwise a new profile written by Claude, source 'ai')
//   { "action": "images", "limit": 10 }
//       → { checked, found }   (Wikimedia lookup for species without one yet)

import Anthropic from "npm:@anthropic-ai/sdk@1";
import { createClient } from "npm:@supabase/supabase-js@2";
import { HttpError, isSignedIn, json, loadImage } from "../_shared/images.ts";
import { matchSpecies, type SpeciesName } from "../_shared/species.ts";
import { findSpeciesImage } from "../_shared/wikimedia.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
const MODEL = "claude-opus-5-5";

const SOIL_TYPES = ["universal", "cactus", "orchid", "herb", "peat_free", "other"];

async function ask<T>(system: string, content: Anthropic.Beta.BetaContentBlockParam[], schema: Record<string, unknown>, effort: "low" | "medium" | "high"): Promise<T> {
  const response = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system,
    output_config: { effort, format: { type: "json_schema", schema } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal") throw new HttpError(422, "declined by the model");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error(`no text in response (stop_reason ${response.stop_reason})`);
  return JSON.parse(text.text) as T;
}

async function allSpecies(): Promise<SpeciesName[]> {
  const { data, error } = await supabase.from("species").select("id, scientific_name, common_name_de, aliases");
  if (error) throw error;
  return data;
}

async function getSpecies(id: string) {
  const { data, error } = await supabase.from("species").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

// --- ensure: existing species or a new AI-written profile -------------------

const PROFILE_SCHEMA = {
  type: "object",
  properties: {
    is_plant: { type: "boolean", description: "false, wenn der Name keine bekannte Pflanze bezeichnet" },
    scientific_name: { type: "string" },
    common_name_de: { type: "string" },
    aliases: { type: "array", items: { type: "string" } },
    moisture_min: { type: "number" },
    moisture_max: { type: "number" },
    light_min_lux: { type: "integer" },
    light_max_lux: { type: "integer" },
    temp_min_c: { type: "number" },
    temp_max_c: { type: "number" },
    humidity_min: { type: "number" },
    humidity_max: { type: "number" },
    conductivity_min: { type: "integer" },
    conductivity_max: { type: "integer" },
    winter_rest: { type: "boolean" },
    winter_moisture_min: { anyOf: [{ type: "number" }, { type: "null" }] },
    fertilize_every_days: { type: "integer" },
    soil_type: { type: "string", enum: SOIL_TYPES },
    toxic_to_pets: { type: "boolean" },
    care_notes: { type: "string" },
  },
  required: [
    "is_plant", "scientific_name", "common_name_de", "aliases", "moisture_min", "moisture_max", "light_min_lux", "light_max_lux",
    "temp_min_c", "temp_max_c", "humidity_min", "humidity_max", "conductivity_min", "conductivity_max", "winter_rest",
    "winter_moisture_min", "fertilize_every_days", "soil_type", "toxic_to_pets", "care_notes",
  ],
  additionalProperties: false,
};

const PROFILE_SYSTEM = `Du erstellst Pflegeprofile für Zimmerpflanzen für eine App mit Xiaomi-Flower-Care-Sensoren.
Werte in den Skalen dieses Sensors: Bodenfeuchte in % (Sukkulenten etwa 7–25, typische Grünpflanzen 15–50,
Farne/Calatheen 25–60), Licht in Lux am Sensor (Schattenpflanzen ab ~300, Sonnenpflanzen bis 60000+),
Leitfähigkeit in µS/cm (typisch 350–2000, Sukkulenten 150–1000, Orchideen 100–600).
Luftfeuchte und Temperatur für die Haltung in der Wohnung. Gedüngt wird nur März bis September.
winter_moisture_min nur, wenn die Pflanze eine Winterruhe mit deutlich trockenerer Erde braucht, sonst null.
care_notes: 1–2 kurze, konkrete Pflegetipps auf Deutsch. Wissenschaftlicher Name in aktueller Nomenklatur,
ältere geläufige Namen (z. B. Calathea, Sansevieria) als aliases.`;

type Profile = Record<string, unknown> & { is_plant: boolean; scientific_name: string; common_name_de: string; aliases: string[] };

async function ensure(name: string) {
  const list = await allSpecies();
  const hit = matchSpecies(name, list);
  if (hit) return getSpecies(hit.id);

  const p = await ask<Profile>(PROFILE_SYSTEM, [{ type: "text", text: `Pflegeprofil für: ${name}` }], PROFILE_SCHEMA, "medium");
  if (!p.is_plant) throw new HttpError(422, `„${name}“ ist keine bekannte Pflanze`);
  // Claude may resolve the name to a species we already have (e.g. an old synonym).
  const again = matchSpecies(p.scientific_name, list) ?? matchSpecies(p.common_name_de, list);
  if (again) return getSpecies(again.id);

  const { is_plant: _, ...fields } = p;
  if (Number(fields.moisture_min) >= Number(fields.moisture_max)) fields.moisture_max = Number(fields.moisture_min) + 20;
  const aliases = [...new Set([...p.aliases, name].filter((a) => a.toLowerCase() !== p.scientific_name.toLowerCase()))];
  const { data, error } = await supabase.from("species").insert({ ...fields, aliases, source: "ai" }).select("*").single();
  if (error) throw error;
  await attachImage(data).catch((e) => console.error("image lookup failed", e));
  return getSpecies(data.id);
}

async function attachImage(s: { id: string; scientific_name: string; common_name_de: string }) {
  const image = await findSpeciesImage(s.scientific_name, s.common_name_de);
  await supabase
    .from("species")
    .update({
      image_url: image?.url ?? null,
      image_author: image?.author ?? null,
      image_license: image?.license ?? null,
      image_source_url: image?.source_url ?? null,
      image_checked_at: new Date().toISOString(),
    })
    .eq("id", s.id);
  return image !== null;
}

async function backfillImages(limit: number) {
  const { data, error } = await supabase
    .from("species")
    .select("id, scientific_name, common_name_de")
    .is("image_checked_at", null)
    .limit(limit);
  if (error) throw error;
  let found = 0;
  for (const s of data) if (await attachImage(s).catch(() => false)) found++;
  return { checked: data.length, found };
}

// --- identify: species from a close-up photo --------------------------------

const IDENTIFY_SCHEMA = {
  type: "object",
  properties: {
    is_plant: { type: "boolean" },
    scientific_name: { type: "string" },
    common_name_de: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    alternatives: { type: "array", items: { type: "string" }, description: "bis zu 3 andere mögliche Arten (wissenschaftlich)" },
    reasoning: { type: "string", description: "1 Satz auf Deutsch: woran erkannt" },
  },
  required: ["is_plant", "scientific_name", "common_name_de", "confidence", "alternatives", "reasoning"],
  additionalProperties: false,
};

async function identify(photoPath: string) {
  const list = await allSpecies();
  const known = list.map((s) => `${s.scientific_name} (${s.common_name_de})`).join("; ");
  const r = await ask<{ is_plant: boolean; scientific_name: string; common_name_de: string; confidence: "high" | "medium" | "low"; alternatives: string[]; reasoning: string }>(
    `Du bestimmst Zimmerpflanzen anhand von Fotos. Nenne die Art in aktueller wissenschaftlicher Nomenklatur.
Sei ehrlich bei der Sicherheit: "high" nur bei eindeutigen Merkmalen. Bevorzuge, wenn passend, eine dieser bekannten Arten: ${known}`,
    [
      { type: "image", source: { type: "base64", ...(await loadImage(supabase, photoPath)) } },
      { type: "text", text: "Welche Pflanze ist das?" },
    ],
    IDENTIFY_SCHEMA,
    "medium",
  );
  if (!r.is_plant) return { guess: null, confidence: "low", alternatives: [], reasoning: r.reasoning, species: null };
  // Only create a new profile when reasonably sure; for a low-confidence guess just report it.
  const match = matchSpecies(r.scientific_name, list) ?? matchSpecies(r.common_name_de, list);
  const species = match ? await getSpecies(match.id) : r.confidence === "low" ? null : await ensure(r.scientific_name);
  return { guess: r.scientific_name, common_name_de: r.common_name_de, confidence: r.confidence, alternatives: r.alternatives, reasoning: r.reasoning, species };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  if (!(await isSignedIn(supabase, req))) return json(401, { error: "unauthorized" });

  let body: { action?: string; photo_path?: unknown; name?: unknown; limit?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid JSON" });
  }

  try {
    switch (body.action) {
      case "identify":
        if (typeof body.photo_path !== "string") return json(400, { error: "photo_path required" });
        return json(200, await identify(body.photo_path));
      case "ensure":
        if (typeof body.name !== "string" || body.name.trim().length < 2) return json(400, { error: "name required" });
        return json(200, { species: await ensure(body.name.trim()) });
      case "images":
        return json(200, await backfillImages(Math.min(Math.max(Number(body.limit) || 10, 1), 30)));
      default:
        return json(400, { error: "unknown action" });
    }
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    if (e instanceof Anthropic.RateLimitError) return json(503, { error: "AI rate limit, try again later" });
    if (e instanceof Anthropic.APIError) {
      console.error("anthropic error", e.status, e.message);
      return json(502, { error: "AI request failed" });
    }
    console.error("plant-species failed", e);
    return json(500, { error: "internal error" });
  }
});
