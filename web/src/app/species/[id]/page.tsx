import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ImageCredit, SpeciesForm, SpeciesImage } from "@/components/species-ui";
import { Skeleton } from "@/components/ui";
import { getSpecies } from "@/lib/data";
import { SOIL_TYPES, isUuid, num } from "@/lib/format";
import { NAV_BACK, PageTransition } from "@/components/page-transition";

export async function generateMetadata({ params }: PageProps<"/species/[id]">): Promise<Metadata> {
  const { id } = await params;
  const p = isUuid(id) ? await getSpecies(id) : null;
  return { title: p?.common_name_de ?? "Pflanzenart" };
}

export default function SpeciesDetailPage({ params }: PageProps<"/species/[id]">) {
  return (
    <PageTransition>
      <Suspense fallback={<Skeleton className="h-[30rem]" />}>
        <Detail params={params} />
      </Suspense>
    </PageTransition>
  );
}

async function Detail({ params }: Pick<PageProps<"/species/[id]">, "params">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const s = await getSpecies(id);
  if (!s) notFound();
  const range = (a: number | null, b: number | null, unit: string) => (a === null && b === null ? "–" : `${num(a)}–${num(b)} ${unit}`);

  return (
    <div className="space-y-6">
      <p className="text-sm text-stone-500"><Link href="/species" transitionTypes={NAV_BACK} className="hover:underline">← Pflanzenarten</Link></p>
      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-1">
          <SpeciesImage species={s} className={`${s.image_url ? "aspect-[4/3]" : "aspect-[3/1]"} w-full rounded-2xl sm:aspect-square`} />
          <ImageCredit species={s} />
        </div>
        <div className="space-y-4">
          <div>
            <h1>{s.common_name_de}</h1>
            <p className="text-stone-500 italic">{s.scientific_name}</p>
            {s.aliases.length > 0 && <p className="text-xs text-stone-500">Auch: {s.aliases.join(", ")}</p>}
          </div>
          {s.care_notes && <p className="text-sm">{s.care_notes}</p>}
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Fact label="Bodenfeuchte">{range(s.moisture_min, s.moisture_max, "%")}</Fact>
            <Fact label="Licht">{range(s.light_min_lux, s.light_max_lux, "lx")}</Fact>
            <Fact label="Temperatur">{range(s.temp_min_c, s.temp_max_c, "°C")}</Fact>
            <Fact label="Luftfeuchte">{range(s.humidity_min, s.humidity_max, "%")}</Fact>
            <Fact label="Dünger (Leitwert)">{range(s.conductivity_min, s.conductivity_max, "µS/cm")}</Fact>
            <Fact label="Düngen">{s.fertilize_every_days ? `alle ${s.fertilize_every_days} Tage (März–Sept.)` : "–"}</Fact>
            <Fact label="Winterruhe">{s.winter_rest ? `ja${s.winter_moisture_min !== null ? `, Feuchte ab ${num(s.winter_moisture_min)} %` : ""}` : "nein"}</Fact>
            <Fact label="Erde">{SOIL_TYPES[s.soil_type]}</Fact>
            <Fact label="Giftig für Haustiere">{s.toxic_to_pets === null ? "unbekannt" : s.toxic_to_pets ? "ja" : "nein"}</Fact>
            <Fact label="Quelle">{s.source === "ai" ? "von der KI erstellt" : s.source === "manual" ? "manuell" : "Basisliste"}</Fact>
          </dl>
        </div>
      </div>
      <details className="card p-5">
        <summary className="cursor-pointer font-medium">Werte bearbeiten</summary>
        <div className="mt-4"><SpeciesForm species={s} /></div>
      </details>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-stone-100 px-3 py-2 dark:bg-stone-800/60">
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
