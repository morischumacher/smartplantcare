import Link from "next/link";
import { Suspense } from "react";
import { FloorPlanMap } from "@/components/floor-plan";
import { ChevronIcon, DropIcon, MapIcon, PlusIcon } from "@/components/icons";
import { InstallHint } from "@/components/install-hint";
import { PlantCard } from "@/components/plant-card";
import { QuickWater } from "@/components/watering";
import { Empty, Skeleton } from "@/components/ui";
import { getSummary, getVacations } from "@/lib/data";
import { date, num, relTime } from "@/lib/format";
import type { RoomSummary } from "@/lib/types";

export default function OverviewPage() {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  const [summary, vacations] = await Promise.all([getSummary(), getVacations()]);
  const plants = summary.rooms.flatMap((r) => r.plants);
  const today = new Date().toISOString().slice(0, 10);
  const vacation = vacations.find((v) => v.starts_on <= today);
  const thirsty = plants.filter((p) => p.status === "water_now" || p.status === "water_soon");

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1>Deine Pflanzen</h1>
          <p className="text-sm text-stone-500">
            {plants.length === 1 ? "1 Pflanze" : `${plants.length} Pflanzen`} · aktualisiert {relTime(summary.generated_at)}
          </p>
        </div>
        <Link href="/plants/new" className="btn shrink-0" aria-label="Pflanze hinzufügen">
          <PlusIcon className="size-4" /> <span className="hidden sm:inline">Pflanze</span>
        </Link>
      </div>

      <InstallHint />

      {vacation && (
        <div className="card border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
          Urlaubsmodus bis {date(vacation.ends_on)} – Gießen in dieser Zeit fließt nicht ins Lernen ein.
        </div>
      )}

      {thirsty.length > 0 && (
        <section className="card overflow-hidden border-rose-200 bg-rose-50/70 dark:border-rose-900/70 dark:bg-rose-950/30">
          <h2 className="flex items-center gap-2 px-4 pt-4 pb-2 text-sm font-medium text-rose-700 dark:text-rose-300">
            <DropIcon className="size-4" /> {thirsty.length === 1 ? "1 Pflanze braucht Wasser" : `${thirsty.length} Pflanzen brauchen Wasser`}
          </h2>
          <ul className="divide-y divide-rose-200/60 dark:divide-rose-900/50">
            {thirsty.map((p) => (
              <li key={p.id} className="flex items-center gap-2 pr-4">
                <Link href={`/plants/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 transition hover:opacity-80">
                  <span className={`size-2 shrink-0 rounded-full ${p.status === "water_now" ? "bg-rose-500" : "bg-amber-400"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block text-xs text-stone-500">
                      {num(p.moisture)} % {p.status === "water_now" ? (p.recommended_ml ? `· jetzt ca. ${num(p.recommended_ml)} ml` : "· jetzt gießen") : p.next_watering_at ? `· ${relTime(p.next_watering_at)}` : "· bald"}
                    </span>
                  </span>
                </Link>
                {p.status === "water_now" && p.recommended_ml ? (
                  <QuickWater plantId={p.id} ml={p.recommended_ml} />
                ) : (
                  <ChevronIcon className="size-4 shrink-0 text-stone-400" />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {plants.length === 0 && (
        <Welcome hasRooms={summary.rooms.some((r) => r.id)} />
      )}

      {summary.rooms.filter((r) => r.plants.length > 0 || r.id).map((room) => (
        <RoomSection key={room.id ?? "none"} room={room} />
      ))}
    </div>
  );
}

function RoomSection({ room }: { room: RoomSummary }) {
  const c = room.climate;
  const climateClass =
    c?.status === "ok"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
      : c?.status === "no_data" || !c
        ? "bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
        : "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200";
  const placed = room.plants.some((p) => p.map);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="h2">{room.name}</h2>
        {c && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${climateClass}`}>
            {c.humidity === null && c.temperature === null ? (
              "noch keine Klimadaten"
            ) : (
              <>
                {num(c.temperature, 1)} °C · {num(c.humidity)} % Luftfeuchte
                {c.status === "too_dry" && " · zu trocken"}
                {c.status === "too_humid" && " · zu feucht"}
              </>
            )}
          </span>
        )}
        {room.id && (
          <Link href={`/rooms/${room.id}`} className="ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-sm text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950">
            <MapIcon className="size-4" /> {room.floor_plan ? "Karte" : "Karte anlegen"}
          </Link>
        )}
      </div>
      <div className={room.floor_plan && placed ? "grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : ""}>
        {room.floor_plan && placed && (
          <div className="card hidden self-start p-3 lg:block">
            <FloorPlanMap plan={room.floor_plan} plants={room.plants} compact />
          </div>
        )}
        {room.plants.length > 0 ? (
          <div className={`grid gap-3 sm:grid-cols-2 ${room.floor_plan && placed ? "" : "lg:grid-cols-3"}`}>
            {room.plants.map((p) => <PlantCard key={p.id} plant={p} />)}
          </div>
        ) : (
          <Empty>Noch keine Pflanzen in diesem Raum.</Empty>
        )}
      </div>
    </section>
  );
}

/** First start: what to do, in order. */
function Welcome({ hasRooms }: { hasRooms: boolean }) {
  const steps = [
    { done: hasRooms, title: "Raum anlegen", text: "z. B. Wohnzimmer – mit Zielwerten für die Luftfeuchte.", href: "/settings" },
    { done: false, title: "Erste Pflanze hinzufügen", text: "Art per Foto erkennen lassen, Topfgröße eintragen, Sensor zuordnen.", href: "/plants/new" },
    { done: false, title: "Benachrichtigungen einschalten", text: "Push aufs Handy, wenn eine Pflanze Wasser braucht.", href: "/settings#benachrichtigungen" },
  ];
  return (
    <section className="card p-5">
      <h2 className="h2">Willkommen</h2>
      <p className="mt-1 text-sm text-stone-500">In drei Schritten startklar. Die Sensoren erscheinen von selbst, sobald das Gateway sie empfängt.</p>
      <ol className="mt-4 space-y-2">
        {steps.map((s, i) => (
          <li key={s.title}>
            <Link href={s.href} className="flex items-center gap-3 rounded-2xl border border-stone-200 p-3 transition hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800/50">
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${s.done ? "bg-emerald-700 text-white" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"}`}>
                {s.done ? "✓" : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{s.title}</span>
                <span className="block text-xs text-stone-500">{s.text}</span>
              </span>
              <ChevronIcon className="size-4 text-stone-400" />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 w-60" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40" />)}
      </div>
    </div>
  );
}
