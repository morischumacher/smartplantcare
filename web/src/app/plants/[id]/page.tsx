import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SensorCharts } from "@/components/charts";
import { CameraIcon, DropIcon, SunIcon, ThermoIcon } from "@/components/icons";
import { PhotoTimeline, PhotoUpload } from "@/components/photos";
import { MoistureBar, Skeleton, StatusPill } from "@/components/ui";
import { PendingWaterings, WateringForm, WateringHistory } from "@/components/watering";
import { getHourly, getPhotos, getPlant, getSummary, getWaterings } from "@/lib/data";
import { SOIL_TYPES, date, lightCategory, num, relTime } from "@/lib/format";

export default function PlantPage({ params, searchParams }: PageProps<"/plants/[id]">) {
  return (
    <Suspense fallback={<PlantSkeleton />}>
      <Plant params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const CONFIDENCE = { estimate: "Schätzung", low: "wenig Daten", medium: "mittel", high: "sicher" };
const SOURCE = {
  learned: "aus deinen Gießvorgängen gelernt",
  previous_pot: "vom vorherigen Topf übernommen",
  pot_size: "aus der Topfgröße geschätzt",
  none: "noch keine Grundlage",
};

async function Plant({ params, searchParams }: Pick<PageProps<"/plants/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const days = (await searchParams).days === "30" ? 30 : 7;
  const [summary, plant, hourly, waterings, photos] = await Promise.all([
    getSummary(),
    getPlant(id),
    getHourly(id, days),
    getWaterings(id),
    getPhotos(id),
  ]);
  const room = summary.rooms.find((r) => r.plants.some((p) => p.id === id));
  const s = room?.plants.find((p) => p.id === id);
  if (!plant || !s) notFound();
  const pot = plant.pots[0];
  const light = lightCategory(s.light_peak_7d);
  const now = new Date(summary.generated_at).getTime();
  const since = now - days * 86_400_000;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-stone-500">
            <Link href="/" className="hover:underline">Übersicht</Link>
            {room?.id && <> · <Link href={`/rooms/${room.id}`} className="hover:underline">{room.name}</Link></>}
          </p>
          <h1 className="text-2xl font-semibold">{plant.name}</h1>
          {plant.species && <p className="text-sm text-stone-500 italic">{plant.species}</p>}
        </div>
        <StatusPill status={s.status} />
        <Link href={`/plants/${id}/settings`} className="btn-ghost">Bearbeiten</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={<DropIcon className="size-4" />} label="Bodenfeuchte" value={`${num(s.moisture)} %`}>
          <MoistureBar value={s.moisture} min={s.target.min} max={s.target.max} status={s.status} />
          <p className="mt-1 text-xs text-stone-500">Ziel {s.target.min}–{s.target.max} %</p>
        </Stat>
        <Stat icon={<ThermoIcon className="size-4" />} label="Temperatur" value={`${num(s.temperature, 1)} °C`} />
        <Stat icon={<SunIcon className="size-4" />} label="Licht" value={`${num(s.light)} lx`}>
          {light && <p className="text-xs text-stone-500">Standort: {light.label} (max. {num(s.light_peak_7d)} lx)</p>}
        </Stat>
        <Stat icon={<span className="text-xs">µS</span>} label="Dünger (Leitwert)" value={`${num(s.conductivity)} µS/cm`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Verlauf</h2>
            <div className="flex rounded-lg bg-stone-100 p-0.5 text-xs dark:bg-stone-800">
              {[7, 30].map((d) => (
                <Link
                  key={d}
                  href={`/plants/${id}${d === 30 ? "?days=30" : ""}`}
                  scroll={false}
                  className={`rounded-md px-2.5 py-1 ${d === days ? "bg-white shadow-sm dark:bg-stone-700" : "text-stone-500"}`}
                >
                  {d} Tage
                </Link>
              ))}
            </div>
          </div>
          <SensorCharts
            data={hourly}
            target={s.target}
            days={days}
            now={now}
            waterings={waterings.filter((w) => new Date(w.ts).getTime() >= since)}
          />
        </section>

        <div className="space-y-6">
          <section className="card p-4">
            <h2 className="mb-1 font-semibold">Gießen</h2>
            <p className="mb-3 text-sm text-stone-500">
              {s.status === "water_now"
                ? `Jetzt gießen – empfohlen ${s.recommended_ml ? `${num(s.recommended_ml)} ml` : "bis die Erde gleichmäßig feucht ist"}.`
                : s.next_watering_at
                  ? `Nächstes Gießen voraussichtlich ${relTime(s.next_watering_at)}.`
                  : "Noch keine Prognose."}
            </p>
            <WateringForm plantId={id} recommended={s.recommended_ml} />
            {s.pending_waterings.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-medium">Erkanntes Gießen bestätigen</h3>
                <PendingWaterings plantId={id} pending={s.pending_waterings} mlPerPoint={s.learning.ml_per_point} />
              </div>
            )}
          </section>

          {s.hints.filter((h) => h.code !== "confirm_watering").length > 0 && (
            <section className="space-y-2">
              {s.hints.filter((h) => h.code !== "confirm_watering").map((h) => (
                <div
                  key={h.code}
                  className={`rounded-xl p-3 text-sm ${h.severity === "warning" ? "bg-amber-50 text-amber-900 dark:bg-amber-400/10 dark:text-amber-100" : "bg-sky-50 text-sky-900 dark:bg-sky-500/10 dark:text-sky-100"}`}
                >
                  {h.message}
                </div>
              ))}
            </section>
          )}

          <section className="card p-4 text-sm">
            <h2 className="mb-2 font-semibold">Was die App gelernt hat</h2>
            <dl className="space-y-1.5">
              <Row label="1 % Feuchte entspricht">{s.learning.ml_per_point ? `${num(s.learning.ml_per_point)} ml` : "–"}</Row>
              <Row label="Trocknet ab um">{s.learning.dry_rate_per_day ? `${num(s.learning.dry_rate_per_day, 1)} % pro Tag` : "–"}</Row>
              <Row label="Grundlage">{SOURCE[s.learning.source]}</Row>
              <Row label="Sicherheit">{CONFIDENCE[s.learning.confidence]} ({s.learning.samples} Gießvorgänge)</Row>
              {pot && (
                <Row label="Topf">
                  {[pot.volume_l && `${num(pot.volume_l, 1)} l`, pot.diameter_cm && `Ø ${num(pot.diameter_cm)} cm`, SOIL_TYPES[pot.soil_type]]
                    .filter(Boolean)
                    .join(" · ")}
                  <span className="block text-xs text-stone-500">seit {date(pot.started_at)}</span>
                </Row>
              )}
            </dl>
          </section>
        </div>
      </div>

      <section className="card p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold"><CameraIcon className="size-5" /> Tagebuch</h2>
          <PhotoUpload plantId={id} reason={s.photo_request?.reason ?? null} />
        </div>
        {s.photo_request && (
          <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100">{s.photo_request.message}</p>
        )}
        <PhotoTimeline photos={photos} />
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Gießprotokoll</h2>
        <WateringHistory items={waterings} />
      </section>
    </div>
  );
}

function Stat({ icon, label, value, children }: { icon: React.ReactNode; label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <p className="mb-1 flex items-center gap-1.5 text-xs text-stone-500">{icon} {label}</p>
      <p className="mb-2 text-xl font-semibold tabular-nums">{value}</p>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function PlantSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-14 w-72" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="h-96" />
    </div>
  );
}
