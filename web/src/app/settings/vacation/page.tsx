import type { Metadata } from "next";
import { Suspense } from "react";
import { DeleteVacation, SitterList, VacationForm } from "@/components/settings-forms";
import { SettingsHeader } from "@/components/settings-ui";
import { Skeleton } from "@/components/ui";
import { getSummary, getVacations } from "@/lib/data";
import { date } from "@/lib/format";
import { sitterText } from "@/lib/sitter";

export const metadata: Metadata = { title: "Urlaub" };

export default function VacationPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <SettingsHeader title="Urlaub">
        In dieser Zeit fließt Gießen nicht ins Lernen ein und es kommen nur kritische Benachrichtigungen. Wer für dich gießt, bekommt die Gießliste – per WhatsApp, Mail oder ausgedruckt.
      </SettingsHeader>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Vacation />
      </Suspense>
    </div>
  );
}

async function Vacation() {
  const [vacations, summary] = await Promise.all([getVacations(), getSummary()]);
  const next = vacations[0];
  return (
    <>
      <section className="card space-y-4 p-4">
        {vacations.length > 0 && (
          <ul className="divide-y divide-stone-100 text-sm dark:divide-stone-800">
            {vacations.map((v) => (
              <li key={v.id} className="flex items-center gap-3 py-2">
                <span className="font-medium">{date(v.starts_on)} – {date(v.ends_on)}</span>
                {v.notes && <span className="truncate text-stone-500">{v.notes}</span>}
                <span className="ml-auto"><DeleteVacation id={v.id} /></span>
              </li>
            ))}
          </ul>
        )}
        <VacationForm />
      </section>
      {summary.rooms.some((r) => r.plants.length > 0) && (
        <SitterList text={sitterText(summary.rooms, next ? `${date(next.starts_on)} – ${date(next.ends_on)}` : undefined)} />
      )}
    </>
  );
}
