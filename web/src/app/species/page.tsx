import type { Metadata } from "next";
import { Suspense } from "react";
import { SpeciesBrowser } from "@/components/species-ui";
import { Skeleton } from "@/components/ui";
import { getSpeciesList } from "@/lib/data";
import { PageTransition } from "@/components/page-transition";

export const metadata: Metadata = { title: "Pflanzenarten" };

export default function SpeciesPage() {
  return (
    <PageTransition>
      <div className="space-y-5">
        <div>
          <h1>Pflanzenarten</h1>
          <p className="text-sm text-stone-500">
            Pflegeprofile mit Zielwerten – sie sind die Startwerte für neue Pflanzen. Fehlt eine Art, such danach und lass sie von der KI anlegen.
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-96" />}>
          <List />
        </Suspense>
      </div>
    </PageTransition>
  );
}

async function List() {
  return <SpeciesBrowser species={await getSpeciesList()} />;
}
