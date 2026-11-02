import Link from "next/link";
import { LeafIcon } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-sm text-center">
      <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-stone-200 text-stone-500 dark:bg-stone-800">
        <LeafIcon className="size-7" />
      </span>
      <h1>Nicht gefunden</h1>
      <p className="mt-1 mb-6 text-sm text-stone-500">Diese Seite gibt es nicht (mehr) – vielleicht wurde die Pflanze gelöscht.</p>
      <Link href="/" className="btn">Zur Übersicht</Link>
    </div>
  );
}
