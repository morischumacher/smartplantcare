import type { Metadata } from "next";
import { Suspense } from "react";
import { signOut } from "@/app/actions";
import { ArchiveIcon, BellIcon, DropIcon, DoorIcon, SensorIcon, SparkIcon, SuitcaseIcon } from "@/components/icons";
import { SettingsRow } from "@/components/settings-ui";
import { Skeleton } from "@/components/ui";
import { summarize, usd } from "@/lib/ai-cost";
import { getAiUsage, getArchivedPlants, getCareSettings, getNotifySettings, getRooms, getSensors, getVacations } from "@/lib/data";
import { date } from "@/lib/format";
import { silentSensors } from "@/lib/sensors";
import { PageTransition } from "@/components/page-transition";

export const metadata: Metadata = { title: "Einstellungen" };

export default function SettingsPage() {
  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl space-y-6">
        <h1>Einstellungen</h1>
        <Suspense fallback={<Skeleton className="h-80" />}>
          <Menu />
        </Suspense>
        <form action={signOut} className="sm:hidden">
          <button className="btn-ghost w-full">Abmelden</button>
        </form>
      </div>
    </PageTransition>
  );
}

// One row per area with its current state, so you see at a glance what is set up and what needs attention.
async function Menu() {
  const [rooms, sensors, vacations, notify, archived, usage, care] = await Promise.all([
    getRooms(),
    getSensors(),
    getVacations(),
    getNotifySettings(),
    getArchivedPlants(),
    getAiUsage().catch(() => []),
    getCareSettings(),
  ]);
  const days = care?.watering_days ?? [];
  const ai = summarize(usage);
  const soil = sensors.filter((s) => s.type !== "hygrometer");
  const hygro = sensors.length - soil.length;
  const unassigned = soil.filter((s) => s.plant_sensors.length === 0).length;
  const silent = silentSensors(sensors).length;
  const today = new Date().toISOString().slice(0, 10);
  const v = vacations[0];

  return (
    <div className="space-y-6">
      <div className="card divide-y divide-stone-100 overflow-hidden dark:divide-stone-800">
        <SettingsRow
          href="/settings/rooms"
          icon={<DoorIcon className="size-5" />}
          title="Räume"
          detail={rooms.length ? rooms.map((r) => r.name).join(", ") : "Noch kein Raum – hier anlegen"}
          warn={rooms.length === 0}
        />
        <SettingsRow
          href="/settings/sensors"
          icon={<SensorIcon className="size-5" />}
          title="Sensoren"
          detail={
            sensors.length === 0
              ? "Noch keine empfangen"
              : silent
                ? `${silent} ${silent === 1 ? "sendet" : "senden"} nichts mehr`
                : unassigned
                  ? `${unassigned} noch keiner Pflanze zugeordnet`
                  : [`${soil.length} Bodensensor${soil.length === 1 ? "" : "en"}`, hygro && `${hygro} Hygrometer`].filter(Boolean).join(" · ")
          }
          warn={silent > 0 || unassigned > 0}
        />
        <SettingsRow
          href="/settings/watering"
          icon={<DropIcon className="size-5" />}
          title="Gießtage"
          detail={days.length ? days.map((d) => ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][d - 1]).join(", ") : "Aus – jede Pflanze an ihrem eigenen Tag"}
        />
        <SettingsRow
          href="/settings/notifications"
          icon={<BellIcon className="size-5" />}
          title="Benachrichtigungen"
          detail={notify?.ntfy_topic ? "An – Push über ntfy" : "Aus – einrichten in 2 Minuten"}
          warn={!notify?.ntfy_topic}
        />
        <SettingsRow
          href="/settings/vacation"
          icon={<SuitcaseIcon className="size-5" />}
          title="Urlaub"
          detail={v ? `${v.starts_on <= today ? "Läuft gerade" : "Geplant"}: ${date(v.starts_on)} – ${date(v.ends_on)}` : "Nichts geplant"}
        />
        <SettingsRow
          href="/settings/ai"
          icon={<SparkIcon className="size-5" />}
          title="KI-Kosten"
          detail={ai.calls ? `${ai.calls} Aufrufe · ${usd(ai.costUsd)} in 30 Tagen` : "Noch keine Aufrufe protokolliert"}
        />
        {archived.length > 0 && (
          <SettingsRow
            href="/settings/archive"
            icon={<ArchiveIcon className="size-5" />}
            title="Archiv"
            detail={archived.length === 1 ? "1 archivierte Pflanze" : `${archived.length} archivierte Pflanzen`}
          />
        )}
      </div>
    </div>
  );
}
