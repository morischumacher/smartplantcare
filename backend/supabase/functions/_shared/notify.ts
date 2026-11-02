// Push notifications via ntfy: which events exist right now, and which of them to send. Pure logic.
//
// An event is sent when it appears, then repeated once a day while it lasts. If it disappears and
// comes back within RESEND_GAP (e.g. moisture hovering at the limit) it is not sent again.
// Quiet hours and vacations hold back everything that is not critical.

export interface NotifyPlant {
  id: string;
  name: string;
  status: string;
  moisture: number | null;
  recommended_ml: number | null;
  hints: { code: string; severity: string; message: string }[];
}

export interface NotifyInput {
  rooms: { name: string; plants: NotifyPlant[] }[];
  alerts: { kind: string; severity: string; room: string; message: string }[];
}

export interface NotifySensor {
  id: string;
  name: string | null;
  mac: string;
  last_seen_at: string | null;
  /** assigned to a plant or a room – unassigned sensors are not watched */
  in_use: boolean;
}

export interface NotifyEvent {
  key: string;
  title: string;
  message: string;
  /** ntfy priority 1–5 */
  priority: number;
  tags: string[];
  critical: boolean;
  /** path in the web app, opened when the notification is tapped */
  path: string;
}

export interface NotifyState {
  key: string;
  active: boolean;
  last_sent_at: string | null;
}

const HOUR = 3_600_000;
export const REMIND_AFTER = 24 * HOUR;
export const RESEND_GAP = 12 * HOUR;
export const SENSOR_SILENT_AFTER = 6 * HOUR;
/** plant hints worth a push; info hints stay in the app */
const PUSH_HINTS = new Set(["stays_wet", "dries_fast", "no_recovery"]);

export function collectEvents(summary: NotifyInput, sensors: NotifySensor[], now: number): NotifyEvent[] {
  const events: NotifyEvent[] = [];
  for (const room of summary.rooms) {
    for (const p of room.plants) {
      if (p.status === "water_now") {
        const amount = p.recommended_ml ? ` – bitte ca. ${p.recommended_ml} ml gießen` : " – bitte gießen";
        events.push({
          key: `water:${p.id}`,
          title: `${p.name} gießen`,
          message: `${p.name}: ${p.moisture === null ? "zu trocken" : `${Math.round(p.moisture)} %`}${amount}`,
          priority: 4,
          tags: ["droplet"],
          critical: false,
          path: `/plants/${p.id}`,
        });
      }
      for (const h of p.hints) {
        if (h.severity !== "warning" || !PUSH_HINTS.has(h.code)) continue;
        events.push({
          key: `hint:${p.id}:${h.code}`,
          title: p.name,
          message: h.message,
          priority: 3,
          tags: ["seedling"],
          critical: false,
          path: `/plants/${p.id}`,
        });
      }
    }
  }
  for (const a of summary.alerts) {
    const critical = a.severity === "critical";
    events.push({
      key: `climate:${a.room}:${a.kind}`,
      title: a.room,
      message: a.message,
      priority: critical ? 5 : 4,
      tags: [a.kind === "humidity" ? "sweat_droplets" : "thermometer"],
      critical,
      path: "/",
    });
  }
  for (const s of sensors) {
    if (!s.in_use || !s.last_seen_at) continue;
    const silent = now - new Date(s.last_seen_at).getTime();
    if (silent < SENSOR_SILENT_AFTER) continue;
    events.push({
      key: `sensor:${s.id}`,
      title: "Sensor sendet nicht",
      message: `${s.name ?? s.mac} sendet seit ${Math.floor(silent / HOUR)} Std. nicht mehr – Batterie oder Reichweite prüfen`,
      priority: 3,
      tags: ["electric_plug"],
      critical: false,
      path: "/settings",
    });
  }
  return events;
}

/** Hour of day in Berlin; quiet hours may wrap midnight (22 → 8). */
export function inQuietHours(now: number, from: number | null, to: number | null): boolean {
  if (from === null || to === null || from === to) return false;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(now));
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

export function decide(
  events: NotifyEvent[],
  state: NotifyState[],
  opts: { now: number; quiet: boolean; vacation: boolean },
): { send: NotifyEvent[]; state: NotifyState[] } {
  const byKey = new Map(state.map((s) => [s.key, s]));
  const send: NotifyEvent[] = [];
  const next: NotifyState[] = [];
  const nowIso = new Date(opts.now).toISOString();

  for (const e of events) {
    const prev = byKey.get(e.key);
    const last = prev?.last_sent_at ? new Date(prev.last_sent_at).getTime() : null;
    const due = last === null || opts.now - last >= (prev?.active ? REMIND_AFTER : RESEND_GAP);
    const held = !e.critical && (opts.quiet || opts.vacation);
    if (due && !held) {
      send.push(e);
      next.push({ key: e.key, active: true, last_sent_at: nowIso });
    } else {
      next.push({ key: e.key, active: true, last_sent_at: prev?.last_sent_at ?? null });
    }
  }
  const current = new Set(events.map((e) => e.key));
  for (const s of state) {
    if (!current.has(s.key) && s.active) next.push({ ...s, active: false });
  }
  // most important first, so a burst on the phone starts with what matters
  send.sort((a, b) => b.priority - a.priority);
  return { send, state: next };
}
