// Automatic winter: the plant's own targets hold for the growing season. In winter (short, weak
// daylight) houseplants pause:
//   - every plant: grows hardly at all, uses less water (the learned drying rate shows that by
//     itself), needs no fertiliser, and gets far less light than in summer – normal for the season
//   - species with a real winter rest (succulents, cacti, Pilea …): may also stand cooler and dry
//     out further before the next watering
// The pause runs from November to February, and in October and March as soon as the plant's
// brightest hour stays below its light minimum. Pure logic, no manual switch.

/** Share of the summer daylight peak that is normal in each month (Jan … Dec), Germany. */
const LIGHT_FACTOR = [0.35, 0.5, 0.7, 1, 1, 1, 1, 1, 1, 0.7, 0.5, 0.35];

/** How much cooler than the plant's minimum is fine at night (22–6 o'clock). */
export const NIGHT_TEMP_DROP_C = 2;
/** How much cooler species with a winter rest may stand during the rest. */
export const REST_TEMP_DROP_C = 3;

export type Range = { min: number | null; max: number | null };

/** Month (0–11) and hour (0–23) of a moment in Europe/Berlin. */
export function berlinTime(t: number): { month: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", { month: "numeric", hour: "numeric", hourCycle: "h23", timeZone: "Europe/Berlin" })
    .formatToParts(t);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { month: get("month") - 1, hour: get("hour") % 24 };
}

/** Is the winter pause on? Nov–Feb always; Oct and Mar when the plant gets less than its light minimum. */
export function winterPause(now: number, lightPeak: number | null, lightMin: number | null): boolean {
  const { month } = berlinTime(now);
  if (month === 10 || month === 11 || month <= 1) return true;
  if (month === 9 || month === 2) return lightPeak !== null && lightMin !== null && lightPeak < lightMin;
  return false;
}

export interface SeasonInput {
  moisture: { min: number; max: number };
  temp: Range;
  light: Range;
  ec: Range;
  winter_rest: boolean;
  winter_moisture_min: number | null;
  light_peak: number | null;
  now: number;
}

export interface SeasonTargets {
  /** "pause" for every plant in winter, "rest" for species with a real winter rest. */
  winter: "pause" | "rest" | null;
  moisture: { min: number; max: number };
  temp: Range;
  /** the plant's year-round light target … */
  light: Range;
  /** … and what is normal for this month; null outside the winter pause */
  light_season: Range | null;
  /** fertiliser: no lower limit during the pause (no fertiliser needed) */
  ec: Range;
  /** temperature minimum of the winter rest alone (without the night), null otherwise */
  winter_temp_min: number | null;
}

export function seasonTargets(p: SeasonInput): SeasonTargets {
  const pause = winterPause(p.now, p.light_peak, p.light.min);
  const rest = pause && p.winter_rest;
  const { month, hour } = berlinTime(p.now);
  const night = hour >= 22 || hour < 6;

  const moisture = rest && p.winter_moisture_min !== null && p.winter_moisture_min < p.moisture.min
    ? { min: p.winter_moisture_min, max: p.moisture.max }
    : p.moisture;
  const drop = (rest ? REST_TEMP_DROP_C : 0) + (night ? NIGHT_TEMP_DROP_C : 0);
  const temp = { min: p.temp.min === null ? null : p.temp.min - drop, max: p.temp.max };

  const f = LIGHT_FACTOR[month];
  const scale = (v: number | null) => (v === null ? null : Math.round(v * f));
  const lightSeason = pause && f < 1 ? { min: scale(p.light.min), max: scale(p.light.max) } : null;

  return {
    winter: rest ? "rest" : pause ? "pause" : null,
    moisture,
    temp,
    light: p.light,
    light_season: lightSeason,
    ec: pause ? { min: null, max: p.ec.max } : p.ec,
    winter_temp_min: rest && p.temp.min !== null ? p.temp.min - REST_TEMP_DROP_C : null,
  };
}

/** Short note for the web app and the watch. */
export function winterNote(winter: SeasonTargets["winter"]): string | null {
  if (winter === "rest") return "Winterruhe: kühler stellen ist gut, seltener gießen, nicht düngen.";
  if (winter === "pause") return "Winterpause: wächst kaum, braucht weniger Wasser und keinen Dünger.";
  return null;
}
