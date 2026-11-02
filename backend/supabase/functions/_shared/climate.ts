// Room climate alerts (air humidity, temperature) for widget, watch and later ntfy. Pure logic.
//
// The summary keeps no state, so instead of a real hysteresis an alert only starts a small margin
// outside the target: a value hovering at the limit does not make the alert flicker.

export interface ClimateRoom {
  name: string;
  humidity: number | null;
  humidity_min: number;
  humidity_max: number;
  /** hygrometer temperature, else the average of the room's plant sensors */
  temperature: number | null;
  /** targets of the room's plants; the strictest one counts */
  plant_targets: { temp_min_c: number | null; temp_max_c: number | null }[];
}

export interface ClimateAlert {
  kind: "humidity" | "temperature";
  severity: "warning" | "critical";
  room: string;
  value: number;
  /** short German text, e.g. "Luft zu trocken (31 %) – befeuchten" */
  message: string;
}

export const HUMIDITY_MARGIN = 3;
export const HUMIDITY_CRITICAL = 15;
export const TEMP_MARGIN = 0.5;
export const TEMP_CRITICAL = 3;
/** used when none of the room's plants has a temperature target */
export const DEFAULT_TEMP = { min: 12, max: 30 };

const fmt = (v: number, unit: string) => `${String(Math.round(v * 10) / 10).replace(".", ",")} ${unit}`;

function tempRange(room: ClimateRoom) {
  const mins = room.plant_targets.map((t) => t.temp_min_c).filter((v): v is number => v !== null);
  const maxs = room.plant_targets.map((t) => t.temp_max_c).filter((v): v is number => v !== null);
  return { min: mins.length ? Math.max(...mins) : DEFAULT_TEMP.min, max: maxs.length ? Math.min(...maxs) : DEFAULT_TEMP.max };
}

export function climateAlerts(rooms: ClimateRoom[]): ClimateAlert[] {
  const alerts: ClimateAlert[] = [];
  for (const r of rooms) {
    const h = r.humidity;
    if (h !== null && h < r.humidity_min - HUMIDITY_MARGIN) {
      alerts.push({
        kind: "humidity",
        severity: h < r.humidity_min - HUMIDITY_CRITICAL ? "critical" : "warning",
        room: r.name,
        value: h,
        message: `Luft zu trocken (${fmt(h, "%")}) – befeuchten`,
      });
    } else if (h !== null && h > r.humidity_max + HUMIDITY_MARGIN) {
      alerts.push({
        kind: "humidity",
        severity: h > r.humidity_max + HUMIDITY_CRITICAL ? "critical" : "warning",
        room: r.name,
        value: h,
        message: `Luft zu feucht (${fmt(h, "%")}) – lüften`,
      });
    }

    const t = r.temperature;
    if (t === null || r.plant_targets.length === 0) continue;
    const range = tempRange(r);
    if (t < range.min - TEMP_MARGIN) {
      alerts.push({
        kind: "temperature",
        severity: t < range.min - TEMP_CRITICAL ? "critical" : "warning",
        room: r.name,
        value: t,
        message: `Zu kalt (${fmt(t, "°C")}) – wärmer stellen`,
      });
    } else if (t > range.max + TEMP_MARGIN) {
      alerts.push({
        kind: "temperature",
        severity: t > range.max + TEMP_CRITICAL ? "critical" : "warning",
        room: r.name,
        value: t,
        message: `Zu warm (${fmt(t, "°C")}) – lüften oder beschatten`,
      });
    }
  }
  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}
