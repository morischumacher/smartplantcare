import type { Metadata } from "next";
import { Suspense } from "react";
import { RestorePlant } from "@/components/settings-forms";
import { SettingsHeader } from "@/components/settings-ui";
import { Empty, Skeleton } from "@/components/ui";
import { getArchivedPlants } from "@/lib/data";
import { date } from "@/lib/format";
import { PageTransition } from "@/components/page-transition";

export const metadata: Metadata = { title: "Archiv" };

export default function ArchivePage() {
  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl space-y-5">
        <SettingsHeader title="Archiv">Archivierte Pflanzen mit Verlauf und Fotos. Nach dem Zurückholen den Sensor neu zuordnen.</SettingsHeader>
        <Suspense fallback={<Skeleton className="h-40" />}>
          <Archive />
        </Suspense>
      </div>
    </PageTransition>
  );
}

async function Archive() {
  const archived = await getArchivedPlants();
  if (archived.length === 0) return <Empty>Keine archivierten Pflanzen.</Empty>;
  return (
    <ul className="card divide-y divide-stone-100 text-sm dark:divide-stone-800">
      {archived.map((p) => (
        <li key={p.id} className="flex items-center gap-3 p-4">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{p.name}</span>
            <span className="block text-xs text-stone-500">archiviert {date(p.archived_at!)}</span>
          </span>
          <RestorePlant id={p.id} />
        </li>
      ))}
    </ul>
  );
}
