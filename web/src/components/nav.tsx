"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions";
import { LeafIcon } from "@/components/icons";

const LINKS = [
  { href: "/", label: "Übersicht" },
  { href: "/species", label: "Arten" },
  { href: "/settings", label: "Einstellungen" },
];

function Logo() {
  return (
    <Link href="/" className="mr-3 flex items-center gap-2 font-semibold">
      <LeafIcon className="size-5 text-emerald-600" />
      Pflanzen
    </Link>
  );
}

/** Shown while the path-dependent nav streams in. */
export function NavFallback() {
  return (
    <nav className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-3 text-sm">
      <Logo />
    </nav>
  );
}

export function Nav() {
  const path = usePathname();
  const signedOut = path === "/login";
  return (
    <nav className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-3 text-sm">
      <Logo />
      {!signedOut &&
        LINKS.map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-2.5 py-1.5 hover:bg-stone-200/60 dark:hover:bg-stone-800 ${active ? "font-medium text-emerald-700 dark:text-emerald-400" : ""}`}
            >
              {l.label}
            </Link>
          );
        })}
      {!signedOut && (
        <form action={signOut} className="ml-auto">
          <button className="rounded-lg px-2.5 py-1.5 text-stone-500 hover:bg-stone-200/60 dark:hover:bg-stone-800">Abmelden</button>
        </form>
      )}
    </nav>
  );
}
