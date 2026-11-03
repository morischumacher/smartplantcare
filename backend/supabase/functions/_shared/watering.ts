// Watering logic: learning from waterings, drying-rate forecast, status, hints and photo requests.
// Pure functions without Deno/Supabase imports, so they run under `node --test` too.
// All timestamps are epoch milliseconds (UTC).

export type SoilType = "universal" | "cactus" | "orchid" | "herb" | "peat_free" | "other";
export type Season = "winter" | "spring" | "summer" | "autumn";
export type Status = "ok" | "water_soon" | "water_now" | "no_data";
export type LearningSource = "learned" | "previous_pot" | "pot_size" | "none";
export type PhotoReason = "repot" | "anomaly" | "season" | "scheduled";

export interface HourPoint {
  hour: number;
  moisture: number | null;
}

export interface Watering {
  ts: number;
  amount_ml: number;
  during_vacation: boolean;
}

export interface Pot {
  started_at: number;
  volume_l: number | null;
  soil_type: SoilType;
}

export interface PotPeriod {
  pot: Pot;
  series: HourPoint[];
  waterings: Watering[];
}

export interface PlantInput {
  moisture_min: number;
  moisture_max: number;
  photo_interval_days: number;
  current: PotPeriod;
  previous: PotPeriod | null;
  latest_moisture: { value: number; ts: number } | null;
  last_photo_at: number | null;
  now: number;
}

export interface Hint {
  code: string;
  severity: "info" | "warning";
  message: string;
}

export interface Rise {
  ts: number; // first hour of the rise
  before: number;
  peak: number;
}

export interface Learning {
  ml_per_point: number | null;
  dry_rate_per_day: number | null;
  source: LearningSource;
  samples: number;
  confidence: "estimate" | "low" | "medium" | "high";
  pot_since: number;
}

export interface PlantSummary {
  moisture: number | null;
  status: Status;
  recommended_ml: number | null;
  next_watering_at: number | null;
  learning: Learning;
  pending_waterings: Rise[];
  hints: Hint[];
  photo_request: { reason: PhotoReason; message: string } | null;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// A rise of at least this many points within RISE_WINDOW counts as a watering.
const RISE_MIN_POINTS = 8;
const RISE_WINDOW = 3 * HOUR;
const PEAK_WINDOW = 6 * HOUR;
// After watering, water redistributes in the pot; skip this before measuring the drying rate.
const SETTLE_TIME = 12 * HOUR;
const MIN_SEGMENT = 24 * HOUR;
const MATCH_WINDOW = 3 * HOUR;
const STALE_AFTER = 3 * HOUR;
// After a logged watering the sensor needs a while to show the rise; until then the plant counts as watered.
const JUST_WATERED = 2 * HOUR;
const RECENCY_HALF_LIFE_DAYS = 60;
const OTHER_SEASON_WEIGHT = 0.3;

// Share of the pot volume that holds water between "dry" and "full" (formula start value).
const SOIL_FACTOR: Record<SoilType, number> = {
  universal: 0.4,
  herb: 0.4,
  peat_free: 0.35,
  other: 0.35,
  cactus: 0.25,
  orchid: 0.2,
};

export function seasonOf(ts: number): Season {
  const month = new Date(ts).getUTCMonth(); // 0 = January
  if (month === 11 || month <= 1) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "autumn";
}

function seasonStart(ts: number): number {
  const d = new Date(ts);
  const month = d.getUTCMonth();
  const startMonth = month === 11 ? 11 : month < 2 ? -1 : month - ((month - 2) % 3);
  return Date.UTC(d.getUTCFullYear(), startMonth, 1);
}

function points(series: HourPoint[]): { hour: number; m: number }[] {
  return series.filter((p) => p.moisture !== null).map((p) => ({ hour: p.hour, m: p.moisture as number }));
}

function sampleWeight(ts: number, now: number): number {
  const ageDays = (now - ts) / DAY;
  const recency = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
  return recency * (seasonOf(ts) === seasonOf(now) ? 1 : OTHER_SEASON_WEIGHT);
}

function weightedMedian(samples: { value: number; weight: number }[]): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((s, x) => s + x.weight, 0);
  let acc = 0;
  for (const s of sorted) {
    acc += s.weight;
    if (acc >= total / 2) return s.value;
  }
  return sorted[sorted.length - 1].value;
}

/** Finds sudden moisture jumps, i.e. waterings (logged or not). */
export function detectRises(series: HourPoint[]): Rise[] {
  const pts = points(series);
  const rises: Rise[] = [];
  let i = 0;
  while (i < pts.length - 1) {
    const base = pts[i];
    let j = i + 1;
    let top = i;
    while (j < pts.length && pts[j].hour - base.hour <= RISE_WINDOW) {
      if (pts[j].m > pts[top].m) top = j;
      j++;
    }
    if (pts[top].m - base.m >= RISE_MIN_POINTS) {
      // The rise starts after the lowest point before the top (base may be hours earlier).
      let low = i;
      for (let k = i; k < top; k++) if (pts[k].m <= pts[low].m) low = k;
      let peak = top;
      for (let k = top; k < pts.length && pts[k].hour - pts[low].hour <= PEAK_WINDOW; k++) {
        if (pts[k].m > pts[peak].m) peak = k;
      }
      rises.push({ ts: pts[low + 1].hour, before: pts[low].m, peak: pts[peak].m });
      i = peak + 1;
    } else {
      i++;
    }
  }
  return rises;
}

/** Moisture before and peak after a logged watering, from the hourly series. */
export function measureWatering(series: HourPoint[], ts: number): { before: number; peak: number } | null {
  const pts = points(series);
  const before = [...pts].reverse().find((p) => p.hour < ts && ts - p.hour <= MATCH_WINDOW);
  const after = pts.filter((p) => p.hour >= ts - HOUR && p.hour <= ts + PEAK_WINDOW);
  if (!before || after.length === 0) return null;
  return { before: before.m, peak: Math.max(...after.map((p) => p.m)) };
}

/** ml per moisture point from logged waterings, newest and same-season samples weighted higher. */
export function learnMlPerPoint(period: PotPeriod, now: number): { value: number | null; samples: number } {
  const samples: { value: number; weight: number }[] = [];
  for (const w of period.waterings) {
    if (w.during_vacation) continue;
    const m = measureWatering(period.series, w.ts);
    if (!m || m.peak - m.before < 3) continue;
    samples.push({ value: w.amount_ml / (m.peak - m.before), weight: sampleWeight(w.ts, now) });
  }
  return { value: weightedMedian(samples), samples: samples.length };
}

/** Drying rate in points per day, from the stretches between waterings. */
export function learnDryRate(period: PotPeriod, now: number): number | null {
  const pts = points(period.series);
  const breaks = [
    ...detectRises(period.series).map((r) => r.ts),
    ...period.waterings.map((w) => w.ts),
  ].sort((a, b) => a - b);

  const samples: { value: number; weight: number }[] = [];
  const bounds = [pts[0]?.hour ?? 0, ...breaks, Infinity];
  for (let b = 0; b < bounds.length - 1; b++) {
    const start = b === 0 ? bounds[0] : bounds[b] + SETTLE_TIME;
    const seg = pts.filter((p) => p.hour >= start && p.hour < bounds[b + 1]);
    if (seg.length < 2 || seg[seg.length - 1].hour - seg[0].hour < MIN_SEGMENT) continue;

    // Least-squares slope in points per hour.
    const n = seg.length;
    const mx = seg.reduce((s, p) => s + p.hour, 0) / n;
    const my = seg.reduce((s, p) => s + p.m, 0) / n;
    let num = 0;
    let den = 0;
    for (const p of seg) {
      num += (p.hour - mx) * (p.m - my);
      den += (p.hour - mx) ** 2;
    }
    const perDay = (-num / den) * DAY;
    if (perDay < 0.2 || perDay > 40) continue; // flat or noise
    const duration = seg[n - 1].hour - seg[0].hour;
    samples.push({ value: perDay, weight: (duration / DAY) * sampleWeight(seg[n - 1].hour, now) });
  }
  return weightedMedian(samples);
}

function formulaMlPerPoint(pot: Pot): number | null {
  if (pot.volume_l === null) return null;
  return (pot.volume_l * 1000 * SOIL_FACTOR[pot.soil_type]) / 100;
}

function confidenceOf(samples: number): Learning["confidence"] {
  if (samples === 0) return "estimate";
  if (samples <= 2) return "low";
  if (samples <= 5) return "medium";
  return "high";
}

/**
 * Combines what was learned in the current pot with a prior: the previous pot's learned values
 * scaled to the new pot, or else the pot-size formula. The prior counts like one watering, so
 * real data takes over quickly (1 watering: 50/50, 3 waterings: 75 % learned).
 */
export function learn(input: PlantInput): Learning {
  const { current, previous, now } = input;
  const own = learnMlPerPoint(current, now);
  const ownRate = learnDryRate(current, now);

  let prior: number | null = null;
  let priorRate: number | null = null;
  let priorSource: LearningSource = "none";
  if (previous && previous.pot.volume_l && current.pot.volume_l) {
    const prev = learnMlPerPoint(previous, now);
    const volumeRatio = current.pot.volume_l / previous.pot.volume_l;
    const soilRatio = SOIL_FACTOR[current.pot.soil_type] / SOIL_FACTOR[previous.pot.soil_type];
    if (prev.value !== null) {
      prior = prev.value * volumeRatio * soilRatio;
      priorSource = "previous_pot";
    }
    const prevRate = learnDryRate(previous, now);
    // Larger pots dry slower, but less than proportionally (evaporation happens at the surface).
    if (prevRate !== null) priorRate = prevRate / Math.sqrt(volumeRatio);
  }
  if (prior === null) {
    prior = formulaMlPerPoint(current.pot);
    if (prior !== null) priorSource = "pot_size";
  }

  let ml: number | null;
  let source: LearningSource;
  if (own.value !== null && prior !== null) {
    ml = (own.value * own.samples + prior) / (own.samples + 1);
    source = "learned";
  } else if (own.value !== null) {
    ml = own.value;
    source = "learned";
  } else {
    ml = prior;
    source = priorSource;
  }

  const rate = ownRate ?? priorRate;
  return {
    ml_per_point: ml === null ? null : Math.round(ml * 10) / 10,
    dry_rate_per_day: rate === null ? null : Math.round(rate * 10) / 10,
    source,
    samples: own.samples,
    confidence: confidenceOf(own.samples),
    pot_since: current.pot.started_at,
  };
}

function roundTo10(ml: number): number {
  return Math.max(10, Math.round(ml / 10) * 10);
}

export function summarize(input: PlantInput): PlantSummary {
  const { current, now, moisture_min: min, moisture_max: max } = input;
  const learning = learn(input);
  const hints: Hint[] = [];

  const latest = input.latest_moisture;
  const moisture = latest && now - latest.ts <= STALE_AFTER ? latest.value : null;

  let status: Status = "no_data";
  let nextAt: number | null = null;
  let recommended: number | null = null;
  if (moisture !== null) {
    if (learning.dry_rate_per_day && moisture > min) {
      nextAt = now + ((moisture - min) / learning.dry_rate_per_day) * DAY;
    }
    if (moisture <= min) status = "water_now";
    else if (nextAt !== null && nextAt - now <= 2 * DAY) status = "water_soon";
    else status = "ok";

    if (status !== "ok" && learning.ml_per_point !== null && moisture < max) {
      recommended = roundTo10((max - moisture) * learning.ml_per_point);
    }
  }

  const lastWatering = Math.max(-Infinity, ...current.waterings.map((w) => w.ts));
  if (now - lastWatering <= JUST_WATERED && lastWatering <= now) {
    if (status === "water_now" || status === "water_soon") {
      status = "ok";
      recommended = null;
      nextAt = null;
    }
    hints.push({
      code: "just_watered",
      severity: "info",
      message: "Gerade gegossen – der Sensor zeigt den Anstieg in den nächsten Minuten.",
    });
  }

  // Waterings seen in the data but not logged (last 7 days): the user should confirm the amount.
  const pending = detectRises(current.series).filter(
    (r) => now - r.ts <= 7 * DAY && !current.waterings.some((w) => Math.abs(w.ts - r.ts) <= MATCH_WINDOW),
  );
  if (pending.length > 0) {
    hints.push({
      code: "confirm_watering",
      severity: "info",
      message: `Gießen erkannt – bitte Menge eintragen, damit die App daraus lernt.`,
    });
  }

  if (now - current.pot.started_at <= 21 * DAY) {
    hints.push({
      code: "relearning",
      severity: "info",
      message: "Neuer Topf – die Empfehlungen werden in den nächsten Gießvorgängen neu gelernt.",
    });
  }

  const pts = points(current.series);
  const last3Days = pts.filter((p) => p.hour >= now - 3 * DAY);
  if (last3Days.length >= 48 && last3Days.every((p) => p.m > max)) {
    hints.push({
      code: "stays_wet",
      severity: "warning",
      message: "Erde ist seit 3 Tagen zu nass – weniger gießen, Staunässe und Wurzelfäule vermeiden.",
    });
  }

  if (learning.dry_rate_per_day && (max - min) / learning.dry_rate_per_day < 2) {
    hints.push({
      code: "dries_fast",
      severity: "warning",
      message: "Trocknet in unter 2 Tagen aus – größerer Topf oder wasserspeichernde Erde könnte helfen.",
    });
  }

  const recent = current.waterings.filter((w) => now - w.ts <= 3 * DAY && now - w.ts >= PEAK_WINDOW);
  for (const w of recent) {
    const m = measureWatering(current.series, w.ts);
    if (m && m.peak - m.before < 3 && m.before < max) {
      hints.push({
        code: "no_recovery",
        severity: "warning",
        message: "Feuchte ist nach dem Gießen kaum gestiegen – läuft das Wasser durch, oder sitzt der Sensor locker?",
      });
      break;
    }
  }

  return {
    moisture,
    status,
    recommended_ml: recommended,
    next_watering_at: nextAt === null ? null : Math.round(nextAt),
    learning,
    pending_waterings: pending,
    hints,
    photo_request: photoRequest(input, hints),
  };
}

const ANOMALY_CODES = new Set(["stays_wet", "dries_fast", "no_recovery"]);

export function photoRequest(input: PlantInput, hints: Hint[]): PlantSummary["photo_request"] {
  const { now, last_photo_at: last } = input;
  const potStart = input.current.pot.started_at;
  const since = (ts: number) => last !== null && last >= ts;

  if (now - potStart <= 14 * DAY && !since(potStart)) {
    return { reason: "repot", message: "Neu umgetopft – mach ein Foto als Ausgangspunkt." };
  }
  if (hints.some((h) => ANOMALY_CODES.has(h.code)) && !since(now - 3 * DAY)) {
    return { reason: "anomaly", message: "Die Messwerte sind auffällig – ein Foto hilft, die Ursache zu finden." };
  }
  const seasonBegin = seasonStart(now);
  if (now - seasonBegin <= 14 * DAY && !since(seasonBegin)) {
    return { reason: "season", message: "Neue Jahreszeit – ein Foto zeigt, wie die Pflanze den Wechsel verkraftet." };
  }
  if (!since(now - input.photo_interval_days * DAY)) {
    return { reason: "scheduled", message: "Zeit für ein neues Foto fürs Pflanzentagebuch." };
  }
  return null;
}
