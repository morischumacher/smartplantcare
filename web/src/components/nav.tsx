"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions";
import { BookIcon, GearIcon, HomeIcon, LeafIcon } from "@/components/icons";

// Top bar on every size; on phones the sections move into a tab bar at the bottom (thumb reach,
// like a native app), on larger screens they sit in the top bar.

const LINKS = [
  { href: "/", label: "Pflanzen", Icon: HomeIcon },
  { href: "/species", label: "Arten", Icon: BookIcon },
  { href: "/settings", label: "Einstellungen", Icon: GearIcon },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" || path.startsWith("/plants") || path.startsWith("/rooms") : path.startsWith(href));

function Logo() {
  return (
    <Link href="/" className="mr-4 flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-full bg-emerald-700 text-white dark:bg-emerald-500 dark:text-emerald-950">
        <LeafIcon className="size-4.5" />
      </span>
      <span className="font-display text-lg font-medium tracking-tight">{"Mo's"}<span className="text-emerald-700 dark:text-emerald-400">SmartPlantCare</span></span>
    </Link>
  );
}

/** Shown while the path-dependent nav streams in. */
export function NavFallback() {
  return (
    <nav className="mx-auto flex h-14 max-w-5xl items-center px-4">
    <Logo />
  </nav>
);
}

export function Nav() {
const path = usePathname();
const signedOut = path === "/login";
return (
  <nav className="mx-auto flex h-14 max-w-5xl items-center gap-1 px-4 text-sm">
      <Logo />
      {!signedOut && (
        <>
          <div className="hidden items-center gap-1 sm:flex">
            {LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(path, href) ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 transition hover:bg-stone-200/60 dark:hover:bg-stone-800 ${isActive(path, href) ? "bg-stone-200/70 font-medium dark:bg-stone-800" : "text-stone-600 dark:text-stone-400"}`}
              >
                {label}
              </Link>
            ))}
          </div>
          <form action={signOut} className="ml-auto hidden sm:block">
            <button className="rounded-full px-3 py-1.5 text-stone-500 transition hover:bg-stone-200/60 dark:hover:bg-stone-800">Abmelden</button>
          </form>
        </>
      )}
    </nav>
  );
}

/** Rendered outside the header: its backdrop filter would make `fixed` relative to the header. */
export function TabBar() {
  const path = usePathname();
  if (path === "/login") return null;
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200/80 bg-stone-50/90 backdrop-blur-xl sm:hidden dark:border-stone-800 dark:bg-stone-950/90"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-3">
        {LINKS.map(({ href, label, Icon }) => {
          const active = isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium transition ${active ? "text-emerald-700 dark:text-emerald-400" : "text-stone-500"}`}
            >
              <Icon className="size-6" />
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
