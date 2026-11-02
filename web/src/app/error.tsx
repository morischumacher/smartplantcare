"use client";

import Link from "next/link";
import { AlertIcon } from "@/components/icons";

// Route-level error boundary: a failed request (offline, database hiccup) shows this instead of a blank page.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-sm text-center">
      <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
        <AlertIcon className="size-7" />
      </span>
      <h1>Das hat nicht geklappt</h1>
      <p className="mt-1 mb-6 text-sm text-stone-500">Die Daten konnten nicht geladen werden. Prüfe die Internetverbindung und versuch es noch einmal.</p>
      <div className="flex justify-center gap-2">
        <button className="btn" onClick={reset}>Nochmal versuchen</button>
        <Link href="/" className="btn-ghost">Zur Übersicht</Link>
      </div>
    </div>
  );
}
