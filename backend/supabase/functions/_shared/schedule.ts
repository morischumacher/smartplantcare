// Watering routine: instead of every plant getting its own day, the user picks fixed weekdays
// (e.g. Sunday, or Sunday + Wednesday). On a watering day every plant is watered that would not
// last until the next watering day, and topped up to its upper target, so it lasts as long as
// possible. A plant that would get too dry before the next watering day gets its own extra day.
// Pure logic.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** How far ahead we look for the plant's watering day. */
const HORIZON_DAYS = 60;

export interface SchedulePlant {
  moisture: number | null;
  min: number;
  max: number;
  dry_rate_per_day: number | null;
  ml_per_point: number | null;
  /** own estimate when the plant reaches its minimum (ms), null without data */
  next_at: number | null;
}

export interface PlantPlan {
  /** "day": on a watering day; "extra": cannot wait for the next watering day */
  kind: "day" | "extra";
  /** noon of the watering day (or the plant's own time for "extra") */
  at: number;
  /** topped up to the upper target on that day, null without learned ml per point */
  ml: number | null;
  /** even topped up it doesn't last from one watering day to the next */
  too_fast: boolean;
}

/** ISO weekday (1 = Monday … 7 = Sunday) and the ms of midnight of that Berlin day. */
function berlinDay(t: number): { weekday: number; noon: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short", year: "numeric", month: "numeric", day: "numeric", timeZone: "Europe/Berlin",
  }).formatToParts(t);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  // noon Berlin is 10:00 or 11:00 UTC; 11:00 UTC is "noon-ish" all year and stays on the same day
  const noon = Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day")), 11);
  return { weekday, noon };
}

/** The coming watering days (noon, Berlin), today included, as long as the day isn't over. */
export function wateringDays(weekdays: number[], now: number, horizonDays = HORIZON_DAYS): number[] {
  if (weekdays.length === 0) return [];
  const out: number[] = [];
  for (let i = 0; i <= horizonDays; i++) {
    const d = berlinDay(now + i * DAY);
    if (weekdays.includes(d.weekday) && !out.includes(d.noon)) out.push(d.noon);
  }
  return out;
}

const roundTo10 = (ml: number) => Math.max(10, Math.round(ml / 10) * 10);

export function planPlant(p: SchedulePlant, days: number[], now: number): PlantPlan | null {
  if (p.moisture === null || !p.dry_rate_per_day || days.length === 0) return null;
  const rate = p.dry_rate_per_day;
  const at = (t: number) => p.moisture! - (rate * Math.max(0, t - now)) / DAY;
  const lastsDays = (p.max - p.min) / rate;

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const following = days[i + 1] ?? day + 7 * DAY;
    // too dry before this watering day: it needs its own day
    if (at(day) < p.min) {
      const own = p.next_at ?? now;
      return { kind: "extra", at: Math.max(now, own), ml: amount(p, at(own)), too_fast: lastsDays < (following - day) / DAY };
    }
    // would not last until the following watering day: water on this one
    if (at(following) < p.min) {
      return { kind: "day", at: day, ml: amount(p, at(day)), too_fast: lastsDays < (following - day) / DAY };
    }
  }
  return null; // lasts longer than the horizon
}

function amount(p: SchedulePlant, moistureThen: number): number | null {
  if (p.ml_per_point === null || moistureThen >= p.max) return null;
  return roundTo10((p.max - moistureThen) * p.ml_per_point);
}

/** Same Berlin calendar day? */
export function sameDay(a: number, b: number): boolean {
  return berlinDay(a).noon === berlinDay(b).noon;
}

export interface RoutineInput {
  status: string;
  moisture: number | null;
  min: number;
  max: number;
  next_watering_at: number | null;
  recommended_ml: number | null;
  dry_rate_per_day: number | null;
  ml_per_point: number | null;
  hints: { code: string; severity: "info" | "warning"; message: string }[];
}

export interface RoutineResult {
  status: string;
  next_watering_at: number | null;
  recommended_ml: number | null;
  routine: PlantPlan | null;
  hints: RoutineInput["hints"];
}

/** Moves a plant's watering onto the watering days (status, date, amount); unchanged without routine. */
export function applyRoutine(p: RoutineInput, days: number[], now: number): RoutineResult {
  const unchanged = { status: p.status, next_watering_at: p.next_watering_at, recommended_ml: p.recommended_ml, routine: null, hints: p.hints };
  if (days.length === 0 || p.status === "no_data" || p.hints.some((h) => h.code === "just_watered")) return unchanged;
  const plan = planPlant({ moisture: p.moisture, min: p.min, max: p.max, dry_rate_per_day: p.dry_rate_per_day, ml_per_point: p.ml_per_point, next_at: p.next_watering_at }, days, now);
  if (!plan) return unchanged;

  const hints = [...p.hints];
  if (plan.too_fast) {
    hints.push({
      code: "too_fast_for_routine",
      severity: "info",
      message: "Trocknet schneller, als die Gießtage es erlauben – ein zweiter Gießtag pro Woche, ein größerer Topf oder wasserspeichernde Erde würde helfen.",
    });
  }
  if (plan.kind === "extra") {
    hints.push({ code: "extra_watering", severity: "info", message: "Hält nicht bis zum nächsten Gießtag – einmal zwischendurch gießen." });
    return { ...unchanged, routine: plan, hints };
  }
  // "soon" in calendar days: the watering day is today, tomorrow or the day after
  const daysAhead = Math.round((plan.at - berlinDay(now).noon) / DAY);
  const status = p.status === "water_now" || daysAhead <= 0 ? "water_now" : daysAhead <= 2 ? "water_soon" : "ok";
  return {
    status,
    next_watering_at: plan.at,
    recommended_ml: status === "ok" ? null : plan.ml ?? p.recommended_ml,
    routine: plan,
    hints,
  };
}
