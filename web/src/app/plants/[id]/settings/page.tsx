import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { archivePlant } from "@/app/actions";
import { DeletePlantButton, PlantForm, RepotForm } from "@/components/plant-forms";
import { Skeleton } from "@/components/ui";
import { getPlant, getRooms, getSensors, getSpeciesList } from "@/lib/data";
import { SOIL_TYPES, date, isUuid, num } from "@/lib/format";
import { sensorOptions } from "@/lib/sensors";

export async function generateMetadata({ params }: PageProps<"/plants/[id]/settings">): Promise<Metadata> {
  const { id } = await params;
  const p = isUuid(id) ? await getPlant(id) : null;
  return { title: p ? `${p.name} bearbeiten` : "Bearbeiten" };
}

export default function PlantSettingsPage({ params }: PageProps<"/plants/[id]/settings">) {
  return (
    <div className="mx-auto max-w-2xl">
      <Suspense fallback={<Skeleton className="h-[40rem]" />}>
        <Settings params={params} />
      </Suspense>
    </div>
  );
}

async function Settings({ params }: Pick<PageProps<"/plants/[id]/settings">, "params">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [plant, rooms, sensors, species] = await Promise.all([getPlant(id), getRooms(), getSensors(), getSpeciesList()]);
  if (!plant) notFound();

  return (
    <div className="space-y-6">
      <div>
        <p className="hidden text-sm text-stone-500 sm:block"><Link href={`/plants/${id}`} className="hover:underline">← {plant.name}</Link></p>
        <h1>Bearbeiten</h1>
      </div>
      <section className="card p-5">
        <PlantForm
          plant={{ ...plant, sensor_ids: plant.plant_sensors.map((s: { sensor_id: string }) => s.sensor_id) }}
          rooms={rooms}
          sensors={await sensorOptions(sensors, id)}
          species={species}
        />
      </section>

      <section className="card p-5">
        <h2 className="mb-1 font-medium">Umgetopft?</h2>
        <p className="mb-4 text-sm text-stone-500">
          Neuer Topf oder frische Erde verändern, wie schnell die Pflanze austrocknet. Die App übernimmt die bisherigen Werte
          angepasst an die neue Topfgröße und lernt dann neu.
        </p>
        <RepotForm plantId={id} />
        {plant.pots.length > 0 && (
          <ul className="mt-5 space-y-1 border-t border-stone-100 pt-3 text-sm dark:border-stone-800">
            {plant.pots.map((p: { id: string; started_at: string; volume_l: number | null; diameter_cm: number | null; soil_type: string }, i: number) => (
              <li key={p.id} className="flex justify-between gap-3">
                <span className="text-stone-500">seit {date(p.started_at)}{i === 0 && " (aktuell)"}</span>
                <span>
                  {[p.volume_l && `${num(p.volume_l, 1)} l`, p.diameter_cm && `Ø ${num(p.diameter_cm)} cm`, SOIL_TYPES[p.soil_type]].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-1 font-medium">Archivieren</h2>
        <p className="mb-3 text-sm text-stone-500">
          Die Pflanze verschwindet aus der Übersicht, Verlauf und Fotos bleiben erhalten und ihr Sensor wird frei. Zurückholen kannst du sie unter
          Einstellungen → Archiv.
        </p>
        <form action={archivePlant.bind(null, id)}>
          <button className="btn-ghost">Pflanze archivieren</button>
        </form>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 font-medium">Löschen</h2>
        <p className="mb-3 text-sm text-stone-500">Entfernt die Pflanze mit Gießdaten, Töpfen und Fotos. Die Messwerte bleiben beim Sensor, der Sensor wird frei. Lässt sich nicht rückgängig machen.</p>
        <DeletePlantButton plantId={id} name={plant.name} />
      </section>
    </div>
  );
}
