import type { Metadata } from "next";
import { Suspense } from "react";
import { WateringDaysForm } from "@/components/settings-forms";
import { SettingsHeader } from "@/components/settings-ui";
import { Skeleton } from "@/components/ui";
import { getCareSettings } from "@/lib/data";
import { PageTransition } from "@/components/page-transition";

export const metadata: Metadata = { title: "Gießtage" };

export default function WateringDaysPage() {
  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl space-y-5">
        <SettingsHeader title="Gießtage">
          An festen Wochentagen wird gemeinsam gegossen statt jede Pflanze an ihrem eigenen Tag. An einem Gießtag bekommt jede
          Pflanze Wasser, die nicht bis zum nächsten Gießtag durchhält – und zwar so viel, dass sie möglichst lange reicht. Eine
          Pflanze, die vorher zu trocken würde, bekommt einen Extra-Hinweis. Keinen Tag gewählt = wie bisher.
        </SettingsHeader>
        <Suspense fallback={<Skeleton className="h-32" />}>
          <Form />
        </Suspense>
      </div>
    </PageTransition>
  );
}

async function Form() {
  const care = await getCareSettings();
  return (
    <div className="card p-4">
      {care ? <WateringDaysForm days={care.watering_days} /> : <p className="text-sm text-stone-500">Wird gerade eingerichtet – Datenbank noch nicht aktualisiert.</p>}
    </div>
  );
}
