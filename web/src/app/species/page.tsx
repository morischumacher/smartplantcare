import type { Metadata } from "next";
import { Suspense } from "react";
import { SpeciesBrowser } from "@/components/species-ui";
import { Skeleton } from "@/components/ui";
import { getSpeciesList } from "@/lib/data";

export const metadata: Metadata = { title: "Pflanzenarten" };

export default function SpeciesPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1>Pflanzenarten</h1>
        <p className="text-sm text-stone-500">
          Pflegeprofile mit Zielwerten. Beim Anlegen einer Pflanze werden sie als Startwerte übernommen; fehlende Arten schreibt die KI.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  return <SpeciesBrowser species={await getSpeciesList()} />;
}
