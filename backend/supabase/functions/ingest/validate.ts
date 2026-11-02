// Pure payload validation for `ingest`. No Deno/Supabase imports, so it runs under `node --test` too.

export type SensorType = "flower_care" | "hygrometer";

export interface Reading {
  mac: string;
  type: SensorType;
  ts: string | null; // ISO timestamp, null = use server time
  moisture: number | null;
  temperature: number | null;
  light: number | null;
  conductivity: number | null;
  humidity: number | null;
  battery: number | null;
  rssi: number | null;
}

export interface ValidationResult {
  readings: Reading[];
  errors: string[];
}

const SENSOR_TYPES: SensorType[] = ["flower_care", "hygrometer"];

// Plausible physical ranges; values outside are sensor/parsing glitches.
const RANGES: Record<string, [number, number]> = {
  moisture: [0, 100],
  temperature: [-40, 85],
  light: [0, 200_000],
  conductivity: [0, 20_000],
  humidity: [0, 100],
  battery: [0, 100],
  rssi: [-127, 0],
};

const INTEGER_FIELDS = new Set(["light", "conductivity", "battery", "rssi"]);
const MAX_FUTURE_MS = 10 * 60 * 1000;
const MAX_READINGS = 100;

export function normalizeMac(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const hex = raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 12) return null;
  return hex.match(/.{2}/g)!.join(":");
}

function parseReading(raw: unknown, index: number, now: number): Reading | string {
  const at = `readings[${index}]`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return `${at}: must be an object`;
  }
  const r = raw as Record<string, unknown>;

  const mac = normalizeMac(r.mac);
  if (!mac) return `${at}: invalid mac`;

  if (!SENSOR_TYPES.includes(r.type as SensorType)) {
    return `${at}: type must be one of ${SENSOR_TYPES.join(", ")}`;
  }
  const type = r.type as SensorType;

  let ts: string | null = null;
  if (r.ts !== undefined && r.ts !== null) {
    const parsed = typeof r.ts === "string" ? Date.parse(r.ts) : NaN;
    if (Number.isNaN(parsed)) return `${at}: ts must be an ISO timestamp`;
    if (parsed > now + MAX_FUTURE_MS) return `${at}: ts is in the future`;
    ts = new Date(parsed).toISOString();
  }

  const values: Record<string, number | null> = {};
  for (const [field, [min, max]] of Object.entries(RANGES)) {
    const v = r[field];
    if (v === undefined || v === null) {
      values[field] = null;
      continue;
    }
    if (typeof v !== "number" || !Number.isFinite(v)) return `${at}: ${field} must be a number`;
    if (v < min || v > max) return `${at}: ${field}=${v} out of range [${min}, ${max}]`;
    values[field] = INTEGER_FIELDS.has(field) ? Math.round(v) : Math.round(v * 10) / 10;
  }

  const measured = type === "flower_care"
    ? ["moisture", "temperature", "light", "conductivity"]
    : ["temperature", "humidity"];
  if (measured.every((f) => values[f] === null)) {
    return `${at}: no measurement values for ${type}`;
  }

  return {
    mac,
    type,
    ts,
    moisture: values.moisture,
    temperature: values.temperature,
    light: values.light,
    conductivity: values.conductivity,
    humidity: values.humidity,
    battery: values.battery,
    rssi: values.rssi,
  };
}

// Accepts either `{ "readings": [ ... ] }` or a single reading object.
export function validatePayload(body: unknown, now = Date.now()): ValidationResult {
  if (typeof body !== "object" || body === null) {
    return { readings: [], errors: ["body must be a JSON object"] };
  }
  const b = body as Record<string, unknown>;
  const list = "readings" in b ? b.readings : [b];
  if (!Array.isArray(list) || list.length === 0) {
    return { readings: [], errors: ["readings must be a non-empty array"] };
  }
  if (list.length > MAX_READINGS) {
    return { readings: [], errors: [`at most ${MAX_READINGS} readings per request`] };
  }

  const readings: Reading[] = [];
  const errors: string[] = [];
  list.forEach((raw, i) => {
    const result = parseReading(raw, i, now);
    if (typeof result === "string") errors.push(result);
    else readings.push(result);
  });
  return { readings, errors };
}

// Constant-time comparison so the device secret can't be guessed via response timing.
export function secretsMatch(given: string | null, expected: string): boolean {
  if (given === null || expected.length === 0) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}
