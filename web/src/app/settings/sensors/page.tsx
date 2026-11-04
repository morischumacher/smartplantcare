import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SensorForm, UnignoreSensor } from "@/components/settings-forms";
import { SettingsHeader } from "@/components/settings-ui";
import { Empty, Skeleton } from "@/components/ui";
import { getIgnoredSensors, getRooms, getSensors } from "@/lib/data";
import { relTime } from "@/lib/format";
import { silentSensors } from "@/lib/sensors";

export const metadata: Metadata = { title: "Sensoren" };

export default function SensorsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <SettingsHeader title="Sensoren">
        Neue Sensoren tauchen automatisch auf, sobald das Gateway sie empfängt. Gib ihnen einen Namen, den du am Sensor wiedererkennst. Welcher Sensor in welcher Pflanze steckt, legst du bei der Pflanze unter „Bearbeiten“ fest. Sensoren, die nicht dir gehören (z. B. beim Nachbarn), kannst du ignorieren.
      </SettingsHeader>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Sensors />
      </Suspense>
      <Suspense>
        <Ignored />
      </Suspense>
    </div>
  );
}

async function Sensors() {
  const [sensors, rooms] = await Promise.all([getSensors(), getRooms()]);
  if (sensors.length === 0) return <Empty>Noch keine Sensoren empfangen. Läuft das Gateway, und ist der Sensor in Reichweite?</Empty>;
  const silent = new Set(silentSensors(sensors).map((s) => s.id));
  return (
    <div className="card divide-y divide-stone-100 dark:divide-stone-800">
      {sensors.map((s) => {
        const plant = s.plant_sensors[0];
        return (
          <div key={s.id} className="space-y-2 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-medium">{s.name ?? (s.type === "hygrometer" ? "Hygrometer" : "Bodensensor")}</p>
              <p className={`shrink-0 text-xs ${silent.has(s.id) ? "font-medium text-amber-700 dark:text-amber-300" : "text-stone-500"}`}>
                {s.last_seen_at ? `zuletzt ${relTime(s.last_seen_at)}` : "noch nie empfangen"}
              </p>
            </div>
            {s.type !== "hygrometer" && (
              <p className="text-sm">
                {plant ? (
                  <>Steckt in <Link href={`/plants/${plant.plant_id}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">{plantName(plant.plants)}</Link></>
                ) : (
                  <span className="text-amber-700 dark:text-amber-300">Noch keiner Pflanze zugeordnet</span>
                )}
              </p>
            )}
            <p className="flex flex-wrap gap-x-3 text-xs text-stone-500">
              <span>{s.type === "hygrometer" ? "Hygrometer" : "Flower Care"}</span>
              <span className="font-mono">{s.mac}</span>
              {s.last_battery !== null && <span>Akku {s.last_battery} %</span>}
              {s.last_rssi !== null && <span>Signal {s.last_rssi} dBm</span>}
            </p>
            <SensorForm sensor={s} rooms={rooms} />
          </div>
        );
      })}
    </div>
  );
}

// Foreign sensors: their readings are dropped, but they stay listed so a mistake can be undone.
async function Ignored() {
  const ignored = await getIgnoredSensors();
  if (ignored.length === 0) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="h2">Ignoriert</h2>
        <p className="text-sm text-stone-500">Werte dieser Sensoren werden nicht gespeichert, und sie tauchen oben nicht mehr auf.</p>
      </div>
      <ul className="card divide-y divide-stone-100 text-sm dark:divide-stone-800">
        {ignored.map((s) => (
          <li key={s.id} className="flex items-center gap-3 p-4">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{s.name ?? (s.type === "hygrometer" ? "Hygrometer" : "Flower Care")}</span>
              <span className="block truncate text-xs text-stone-500">
                <span className="font-mono">{s.mac}</span> · zuletzt gesehen {relTime(s.last_seen_at)}
                {s.last_rssi !== null && ` · ${s.last_rssi} dBm`}
              </span>
            </span>
            <UnignoreSensor id={s.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// the embedded relation comes back as an object or a one-element array depending on the generated types
function plantName(p: { name: string } | { name: string }[] | null): string {
  return (Array.isArray(p) ? p[0]?.name : p?.name) ?? "Pflanze";
}
