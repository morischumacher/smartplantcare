// Detail views for the Garmin watch, loaded only when a plant or room is opened: the current
// values plus a short, coarse history, small enough for the watch's memory. Pure logic.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const PLANT_HISTORY_DAYS = 7;
export const PLANT_BUCKET_HOURS = 4; // 7 days -> 42 points
export const ROOM_HISTORY_HOURS = 24; // hourly points

const round1 = (v: number) => Math.round(v * 10) / 10;
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Hours from now until an ISO time (negative = in the past); the watch can't cheaply parse ISO. */
export function hoursFrom(isoTime: string | null, now: number): number | null {
  return isoTime === null ? null : Math.round((Date.parse(isoTime) - now) / HOUR) || 0;
}

/** Weekday of a moment in Europe/Berlin, e.g. "Mo". */
function weekday(t: number): string {
  const name = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Europe/Berlin" }).format(t);
  return WEEKDAYS[["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name)];
}

/** Averages points into equal buckets from `from` to `to`; empty buckets stay null. */
export function buckets(points: { ts: number; value: number | null }[], from: number, to: number, size: number): (number | null)[] {
  const n = Math.round((to - from) / size);
  const sum = new Array<number>(n).fill(0);
  const count = new Array<number>(n).fill(0);
  for (const p of points) {
    if (p.value === null || p.ts < from || p.ts >= to) continue;
    const i = Math.floor((p.ts - from) / size);
    sum[i] += p.value;
    count[i]++;
  }
  return sum.map((s, i) => (count[i] ? round1(s / count[i]) : null));
}

type Range = { min: number | null; max: number | null };

export interface DetailPlant {
  id: string;
  name: string;
  status: string;
  moisture: number | null;
  temperature: number | null;
  light: number | null;
  conductivity: number | null;
  light_peak_7d: number | null;
  target: { min: number; max: number };
  temp_target: { min: number | null; max: number | null };
  light_target?: { min: number | null; max: number | null };
  ec_target?: { min: number | null; max: number | null };
  light_season?: { min: number | null; max: number | null } | null;
  winter?: "pause" | "rest" | null;
  winter_temp_min?: number | null;
  year_target?: { moisture: { min: number; max: number }; temp: Range; ec: Range };
  recommended_ml: number | null;
  next_watering_at: string | null;
  last_watering: { ts: string; amount_ml: number | null } | null;
  learning: { ml_per_point: number | null; dry_rate_per_day: number | null; samples: number };
  hints: { severity: string; message: string }[];
}

/**
 * One plant for the watch: values, watering and learning, and moisture over the last 7 days in
 * 4-hour steps (oldest first). `watered` holds the step indexes with a logged watering.
 */
export function plantDetail(
  p: DetailPlant,
  history: { ts: number; moisture: number | null }[],
  waterings: { ts: number }[],
  now: number,
) {
  const size = PLANT_BUCKET_HOURS * HOUR;
  const to = Math.ceil(now / size) * size;
  const from = to - PLANT_HISTORY_DAYS * DAY;
  const { min, max } = p.target;
  const rate = p.learning.dry_rate_per_day;
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    moisture: p.moisture === null ? null : Math.round(p.moisture),
    // targets: min/max, temp_min/temp_max are the ones that apply now (winter, night); year_* the
    // plant's year-round targets (green band); winter_* the winter range drawn as a blue line
    min,
    max,
    year_min: p.year_target?.moisture.min ?? min,
    year_max: p.year_target?.moisture.max ?? max,
    temp: p.temperature,
    temp_min: p.temp_target.min,
    temp_max: p.temp_target.max,
    temp_year_min: p.year_target ? p.year_target.temp.min : p.temp_target.min,
    temp_year_max: p.year_target ? p.year_target.temp.max : p.temp_target.max,
    winter_temp_min: p.winter_temp_min ?? null,
    light: p.light_peak_7d ?? p.light,
    light_min: p.light_target?.min ?? null,
    light_max: p.light_target?.max ?? null,
    // what is normal for this month (winter only), drawn as a second band
    light_season_min: p.light_season?.min ?? null,
    light_season_max: p.light_season?.max ?? null,
    ec: p.conductivity,
    ec_min: p.year_target ? p.year_target.ec.min : p.ec_target?.min ?? null,
    ec_max: p.year_target ? p.year_target.ec.max : p.ec_target?.max ?? null,
    // in the winter pause no fertiliser is needed: no lower limit (0)
    ec_winter_min: p.winter ? 0 : null,
    ml: p.recommended_ml,
    next_h: hoursFrom(p.next_watering_at, now),
    last_h: p.last_watering ? -hoursFrom(p.last_watering.ts, now)! : null,
    last_ml: p.last_watering?.amount_ml ?? null,
    // days from full to dry, i.e. roughly how often the plant needs water
    every_days: rate ? round1((max - min) / rate) : null,
    dry_rate: rate === null ? null : round1(rate),
    ml_per_point: p.learning.ml_per_point === null ? null : round1(p.learning.ml_per_point),
    samples: p.learning.samples,
    winter: p.winter ?? null,
    hint: p.hints.find((h) => h.severity === "warning")?.message ?? null,
    // weekday of each 24-hour block of the series, for the x axis
    days: Array.from({ length: PLANT_HISTORY_DAYS }, (_, i) => weekday(from + (i + 0.5) * DAY)),
    series: buckets(history.map((h) => ({ ts: h.ts, value: h.moisture })), from, to, size),
    watered: [...new Set(waterings.filter((w) => w.ts >= from && w.ts < to).map((w) => Math.floor((w.ts - from) / size)))],
  };
}

export interface DetailRoom {
  id: string | null;
  name: string;
  climate: { temperature: number | null; humidity: number | null; status: string; target: { min: number; max: number } } | null;
}

/** One room for the watch: current climate and humidity over the last 24 hours, hourly. */
export function roomDetail(r: DetailRoom, readings: { ts: number; humidity: number | null; temperature: number | null }[], now: number) {
  const to = Math.ceil(now / HOUR) * HOUR;
  const from = to - ROOM_HISTORY_HOURS * HOUR;
  return {
    id: r.id,
    name: r.name,
    temp: r.climate?.temperature ?? null,
    humidity: r.climate?.humidity === null || r.climate?.humidity === undefined ? null : Math.round(r.climate.humidity),
    status: r.climate?.status ?? "no_data",
    min: r.climate?.target.min ?? null,
    max: r.climate?.target.max ?? null,
    humidity_series: buckets(readings.map((x) => ({ ts: x.ts, value: x.humidity })), from, to, HOUR),
    temp_series: buckets(readings.map((x) => ({ ts: x.ts, value: x.temperature })), from, to, HOUR),
  };
}
