import type { Metadata } from "next";
import { Suspense } from "react";
import { NotifyForm } from "@/components/settings-forms";
import { SettingsHeader } from "@/components/settings-ui";
import { Skeleton } from "@/components/ui";
import { getNotifySettings } from "@/lib/data";
import { PageTransition } from "@/components/page-transition";

export const metadata: Metadata = { title: "Benachrichtigungen" };

export default function NotificationsPage() {
  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl space-y-5">
        <SettingsHeader title="Benachrichtigungen">
          Push aufs Handy, wenn eine Pflanze Wasser braucht, das Raumklima nicht passt oder ein Sensor verstummt. In der Ruhezeit und im Urlaub kommt nur Kritisches.
        </SettingsHeader>
        <ol className="card list-inside list-decimal space-y-1.5 p-4 text-sm marker:font-medium marker:text-emerald-700">
          <li>App „ntfy“ aus dem App Store installieren</li>
          <li>Unten „Topic erzeugen“ tippen, dann „Kopieren“ und „Speichern“</li>
          <li>In ntfy auf „+“ tippen und das kopierte Topic abonnieren</li>
          <li>„Test senden“ – die Nachricht sollte in ntfy ankommen</li>
        </ol>
        <Suspense fallback={<Skeleton className="h-40" />}>
          <Form />
        </Suspense>
      </div>
    </PageTransition>
  );
}

async function Form() {
  const notify = await getNotifySettings();
  return (
    <div className="card p-4">
      {notify ? <NotifyForm settings={notify} /> : <p className="text-sm text-stone-500">Wird gerade eingerichtet – Datenbank noch nicht aktualisiert.</p>}
    </div>
  );
}
