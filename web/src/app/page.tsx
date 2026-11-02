import Link from "next/link";
import { Suspense } from "react";
import { FloorPlanMap } from "@/components/floor-plan";
import { AlertIcon, MapIcon } from "@/components/icons";
import { PlantCard } from "@/components/plant-card";
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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Deine Pflanzen</h1>
          <p className="text-sm text-stone-500">
            {plants.length} Pflanzen · aktualisiert {relTime(summary.generated_at)}
          </p>
        </div>
        <Link href="/plants/new" className="btn">+ Pflanze</Link>
      </div>

      {vacation && (
        <div className="card border-sky-200 bg-sky-50 p-4 text-sm dark:border-sky-900 dark:bg-sky-950/40">
          Urlaubsmodus bis {date(vacation.ends_on)} – Gießen in dieser Zeit fließt nicht ins Lernen ein.
        </div>
      )}

      {summary.attention > 0 && (
        <div className="card flex items-center gap-3 border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/40">
          <AlertIcon className="size-5 shrink-0 text-rose-600" />
          <p className="text-sm">
            <span className="font-medium">{summary.attention === 1 ? "1 Pflanze braucht" : `${summary.attention} Pflanzen brauchen`} dich.</span>{" "}
            {plants.filter((p) => p.status === "water_now").map((p) => p.name).join(", ")}
          </p>
        </div>
      )}

      {plants.length === 0 && (
        <Empty>
          Noch keine Pflanzen. Lege zuerst unter <Link className="underline" href="/settings">Einstellungen</Link> einen Raum an und
          dann <Link className="underline" href="/plants/new">deine erste Pflanze</Link>.
        </Empty>
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
        <h2 className="text-lg font-semibold">{room.name}</h2>
        {c && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${climateClass}`}>
            {num(c.temperature, 1)} °C · {num(c.humidity)} % Luftfeuchte
            {c.status === "too_dry" && " · zu trocken"}
            {c.status === "too_humid" && " · zu feucht"}
          </span>
        )}
        {room.id && (
          <Link href={`/rooms/${room.id}`} className="ml-auto flex items-center gap-1 text-sm text-emerald-700 hover:underline dark:text-emerald-400">
            <MapIcon className="size-4" /> {room.floor_plan ? "Karte" : "Karte anlegen"}
          </Link>
        )}
      </div>
      <div className={room.floor_plan && placed ? "grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : ""}>
        {room.floor_plan && placed && (
          <div className="card self-start p-3">
            <FloorPlanMap plan={room.floor_plan} plants={room.plants} compact />
          </div>
        )}
        {room.plants.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {room.plants.map((p) => <PlantCard key={p.id} plant={p} />)}
          </div>
        ) : (
          <Empty>Noch keine Pflanzen in diesem Raum.</Empty>
        )}
      </div>
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
