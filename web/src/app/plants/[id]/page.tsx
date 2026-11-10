import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SensorCharts } from "@/components/charts";
import { CameraIcon, DropIcon, SunIcon, ThermoIcon } from "@/components/icons";
import { PhotoTimeline, PhotoUpload } from "@/components/photos";
import { MoistureBar, Skeleton, StatusPill } from "@/components/ui";
import { PendingWaterings, WateringForm, WateringHistory } from "@/components/watering";
import { getHourly, getPhotos, getPlant, getSpecies, getSummary, getWaterings } from "@/lib/data";
import { ImageCredit, SpeciesImage } from "@/components/species-ui";
import { SOIL_TYPES, date, isUuid, lightCategory, num, relTime } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/plants/[id]">): Promise<Metadata> {
  const { id } = await params;
  const p = isUuid(id) ? await getPlant(id) : null;
  return { title: p?.name ?? "Pflanze" };
}

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
  if (!isUuid(id)) notFound();
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
  const species = plant.species_id ? await getSpecies(plant.species_id) : null;
  const light = lightCategory(s.light_peak_7d);
  const now = new Date(summary.generated_at).getTime();
  const since = now - days * 86_400_000;
  const measured = (plant.plant_sensors as { sensors: { last_seen_at: string | null } | null }[])
    .map((ps) => ps.sensors?.last_seen_at)
    .filter((t): t is string => !!t)
    .sort()
    .at(-1);

  // background facts: beside the chart on large screens, at the very end on phones
  const about = (
    <>
    <section className="card p-4 text-sm">
      <h2 className="mb-2 font-medium">Was die App gelernt hat</h2>
      <dl className="space-y-1.5">
        <Row label="Wasser für +1 % Feuchte">{s.learning.ml_per_point ? `${num(s.learning.ml_per_point)} ml` : "–"}</Row>
        <Row label="Trocknet aus um">{s.learning.dry_rate_per_day ? `${num(s.learning.dry_rate_per_day, 1)} % pro Tag` : "–"}</Row>
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
    {species && (
      <section className="card overflow-hidden text-sm">
        <Link href={`/species/${species.id}`} className="flex gap-3 p-4 hover:bg-stone-50 dark:hover:bg-stone-800/40">
          <SpeciesImage species={species} className="size-16 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <p className="font-medium">{species.common_name_de}</p>
            <p className="text-xs text-stone-500 italic">{species.scientific_name}</p>
            <p className="mt-1 text-xs text-stone-500">
              {[
                species.winter_rest && "Winterruhe",
                species.fertilize_every_days && `düngen alle ${species.fertilize_every_days} Tage`,
                species.toxic_to_pets && "giftig für Haustiere",
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
        </Link>
        {species.care_notes && <p className="border-t border-stone-100 px-4 py-3 dark:border-stone-800">{species.care_notes}</p>}
        <div className="px-4 pb-3"><ImageCredit species={species} /></div>
      </section>
    )}

    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        {species && <SpeciesImage species={species} className="size-16 shrink-0 rounded-2xl" />}
        <div className="min-w-0 flex-1">
          <p className="hidden text-sm text-stone-500 sm:block">
            <Link href="/" className="hover:underline">Übersicht</Link>
            {room?.id && <> · <Link href={`/rooms/${room.id}`} className="hover:underline">{room.name}</Link></>}
          </p>
          <h1 className="truncate">{plant.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusPill status={s.status} />
            {s.winter && (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                {s.winter === "rest" ? "Winterruhe" : "Winterpause"}
              </span>
            )}
            {plant.species && plant.species !== plant.name && <span className="text-sm text-stone-500 italic">{plant.species}</span>}
          </div>
        </div>
        <Link href={`/plants/${id}/settings`} className="btn-ghost shrink-0 px-3">Bearbeiten</Link>
      </div>

      {s.moisture == null && s.temperature == null ? (
        <NoReadings plantId={id} hasSensor={plant.plant_sensors.length > 0} />
      ) : (
        <div>
        <div className="card grid grid-cols-2 overflow-hidden md:grid-cols-4 [&>*]:border-stone-100 dark:[&>*]:border-stone-800 [&>*:nth-child(-n+2)]:border-b md:[&>*:nth-child(-n+2)]:border-b-0 [&>*:nth-child(odd)]:border-r md:[&>*:not(:last-child)]:border-r">
          <Stat icon={<DropIcon className="size-4" />} label="Bodenfeuchte" value={`${num(s.moisture)} %`}>
            <MoistureBar value={s.moisture} min={s.target.min} max={s.target.max} status={s.status} />
            <p className="mt-1 text-xs text-stone-500">Ziel {s.target.min}–{s.target.max} %</p>
          </Stat>
          <Stat icon={<ThermoIcon className="size-4" />} label="Temperatur" value={`${num(s.temperature, 1)} °C`} />
          <Stat icon={<SunIcon className="size-4" />} label="Licht" value={`${num(s.light)} lx`}>
            {light && <p className="text-xs text-stone-500">Standort: {light.label} (max. {num(s.light_peak_7d)} lx)</p>}
            {s.light_season?.min != null && s.light_peak_7d != null && (
              <p className="text-xs text-sky-700 dark:text-sky-300">
                {s.light_peak_7d >= s.light_season.min ? "Für den Winter normal" : "Selbst für den Winter zu dunkel"}
              </p>
            )}
          </Stat>
          <Stat icon={<span className="text-xs">µS</span>} label="Dünger (Leitwert)" value={`${num(s.conductivity)} µS/cm`} />
        </div>
          {measured && <p className="mt-1.5 px-1 text-xs text-stone-500">Gemessen {relTime(measured)}</p>}
          {s.winter_note && <p className="mt-1 px-1 text-xs text-sky-700 dark:text-sky-300">{s.winter_note}</p>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Verlauf</h2>
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

        <div className="order-first space-y-6 lg:order-none">
          <section className="card p-4">
            <h2 className="mb-1 font-medium">Gießen</h2>
            <p className="mb-3 text-sm text-stone-500">
              {s.status === "water_now"
                ? `Jetzt gießen – empfohlen ${s.recommended_ml ? `${num(s.recommended_ml)} ml` : "bis die Erde gleichmäßig feucht ist"}.`
                : s.next_watering_at
                  ? `Nächstes Gießen voraussichtlich ${relTime(s.next_watering_at)}.`
                  : s.status === "no_data"
                    ? "Ohne Messwerte gibt es keine Empfehlung – trag Gießen trotzdem ein, dann lernt die App mit."
                    : "Feuchte im grünen Bereich. Wann wieder gegossen werden muss, sagt die App, sobald sie ein paar Tage Austrocknen gemessen hat."}
              {waterings[0] && (
                <span className="block text-xs">Zuletzt {relTime(waterings[0].ts)} · {num(waterings[0].amount_ml)} ml</span>
              )}
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

          <div className="hidden space-y-6 lg:block">{about}</div>
        </div>
      </div>

      <section className="card p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-medium"><CameraIcon className="size-5" /> Tagebuch</h2>
          <PhotoUpload plantId={id} reason={s.photo_request?.reason ?? null} />
        </div>
        {s.photo_request && (
          <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100">{s.photo_request.message}</p>
        )}
        <PhotoTimeline key={photos[0]?.id ?? "none"} photos={photos} />
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-medium">Gießprotokoll</h2>
        <WateringHistory items={waterings} />
      </section>

      <div className="space-y-6 lg:hidden">{about}</div>
    </div>
  );
}

// No sensor values yet: say why and what to do, instead of four cards full of dashes.
function NoReadings({ plantId, hasSensor }: { plantId: string; hasSensor: boolean }) {
  return (
    <div className="card flex items-start gap-3 p-4 text-sm">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500 dark:bg-stone-800">
        <DropIcon className="size-4" />
      </span>
      <div className="flex-1">
        <p className="font-medium">Noch keine Messwerte</p>
        <p className="mt-0.5 text-stone-500">
          {hasSensor
            ? "Der Sensor ist zugeordnet, hat aber noch nichts gesendet. Steht er in Reichweite des Gateways? Neue Werte kommen alle paar Minuten."
            : "Ordne der Pflanze einen Bodensensor zu, dann erscheinen hier Feuchte, Licht, Temperatur und Dünger. Gießen eintragen geht auch ohne Sensor."}
        </p>
        {!hasSensor && (
          <Link href={`/plants/${plantId}/settings`} className="mt-2 inline-block font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            Sensor zuordnen →
          </Link>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value, children }: { icon: React.ReactNode; label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="p-3.5">
      <p className="mb-1 flex items-center gap-1.5 text-xs text-stone-500">{icon} {label}</p>
      <p className="mb-1.5 font-display text-xl tabular-nums">{value}</p>
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
