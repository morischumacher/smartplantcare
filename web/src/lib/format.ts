import type { Status } from "@/lib/types";

// German formatting helpers, usable on server and client.

const rtf = new Intl.RelativeTimeFormat("de", { numeric: "auto" });
const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "vor 3 Stunden", "in 2 Tagen", "gerade eben". */
export function relTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "–";
  const diff = new Date(iso).getTime() - now;
  for (const [unit, ms] of units) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "gerade eben";
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

export function date(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Berlin" });
}

export function num(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined) return "–";
  return v.toLocaleString("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export const STATUS: Record<Status, { label: string; dot: string; pill: string; fill: string }> = {
  water_now: {
    label: "Gießen",
    dot: "bg-rose-500",
    pill: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200",
    fill: "#f43f5e",
  },
  water_soon: {
    label: "Bald gießen",
    dot: "bg-amber-400",
    pill: "bg-amber-100 text-amber-800 dark:bg-amber-400/20 dark:text-amber-200",
    fill: "#f59e0b",
  },
  ok: {
    label: "Alles gut",
    dot: "bg-emerald-500",
    pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
    fill: "#10b981",
  },
  no_data: {
    label: "Keine Daten",
    dot: "bg-stone-400",
    pill: "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200",
    fill: "#a8a29e",
  },
};

/** Rough light category from the brightest hour of the last 7 days (lux). */
export function lightCategory(peak: number | null): { label: string; level: number } | null {
  if (peak === null) return null;
  if (peak < 1000) return { label: "schattig", level: 1 };
  if (peak < 5000) return { label: "hell, indirekt", level: 2 };
  if (peak < 20000) return { label: "hell", level: 3 };
  return { label: "sonnig", level: 4 };
}

export const SOIL_TYPES: Record<string, string> = {
  universal: "Universalerde",
  cactus: "Kakteenerde",
  orchid: "Orchideensubstrat",
  herb: "Kräutererde",
  peat_free: "Torffreie Erde",
  other: "Sonstiges",
};

export const PHOTO_REASONS: Record<string, string> = {
  scheduled: "Regelmäßig",
  anomaly: "Auffällige Werte",
  season: "Jahreszeitenwechsel",
  repot: "Nach dem Umtopfen",
  manual: "Manuell",
};
