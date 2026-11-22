"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions";
import { NAV_BACK } from "@/components/page-transition";
import { BookIcon, ChevronIcon, GearIcon, HomeIcon, LeafIcon } from "@/components/icons";

// Top bar on every size; on phones the sections move into a tab bar at the bottom (thumb reach,
// like a native app), on larger screens they sit in the top bar.

const LINKS = [
  { href: "/", label: "Pflanzen", Icon: HomeIcon },
  { href: "/species", label: "Arten", Icon: BookIcon },
  { href: "/settings", label: "Einstellungen", Icon: GearIcon },
];

// Where the back button of a sub-page leads (phones show it in place of the logo, like an iOS nav bar).
function backLink(path: string): { href: string; label: string } | null {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "plants" && parts.length === 3) return { href: `/plants/${parts[1]}`, label: "Pflanze" };
  if (parts[0] === "plants" || parts[0] === "rooms") return { href: "/", label: "Pflanzen" };
  if (parts[0] === "species" && parts.length === 2) return { href: "/species", label: "Arten" };
  if (parts[0] === "settings" && parts.length === 2) return { href: "/settings", label: "Einstellungen" };
  return null;
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} transitionTypes={NAV_BACK} className="row -ml-2 flex items-center gap-0.5 rounded-full py-1.5 pr-3 pl-1 text-base text-emerald-700 active:opacity-50 sm:hidden dark:text-emerald-400">
      <ChevronIcon className="size-5 rotate-180" /> {label}
    </Link>
  );
}

const isActive = (path: string, href: string) => (href === "/" ? path === "/" || path.startsWith("/plants") || path.startsWith("/rooms") : path.startsWith(href));

function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`mr-4 flex items-center gap-2 ${className}`}>
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
  const back = backLink(path);
  return (
    <nav className="mx-auto flex h-14 max-w-5xl items-center gap-1 px-4 text-sm">
      {back && <BackLink {...back} />}
      <Logo className={back ? "hidden sm:flex" : ""} />
      {!signedOut && (
        <>
          <div className="hidden items-center gap-1 sm:flex">
            {LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(path, href) ? "page" : undefined}
                className={`pressable rounded-full px-3 py-1.5 hover:bg-stone-200/60 dark:hover:bg-stone-800 ${isActive(path, href) ? "bg-stone-200/70 font-medium dark:bg-stone-800" : "text-stone-600 dark:text-stone-400"}`}
              >
                {label}
              </Link>
            ))}
          </div>
          <form action={signOut} className="ml-auto hidden sm:block">
            <button className="pressable rounded-full px-3 py-1.5 text-stone-500 hover:bg-stone-200/60 dark:hover:bg-stone-800">Abmelden</button>
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
      className="bar-material fixed inset-x-0 bottom-0 z-40 border-t border-stone-200/80 sm:hidden dark:border-stone-800"
      style={{ paddingBottom: "env(safe-area-inset-bottom)", viewTransitionName: "tab-bar" }}
    >
      <div className="grid grid-cols-3">
        {LINKS.map(({ href, label, Icon }) => {
          const active = isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`group row flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium tracking-[0.01em] active:opacity-60 ${active ? "text-emerald-700 dark:text-emerald-400" : "text-stone-500"}`}
            >
              <Icon className="size-6 transition-transform duration-200 ease-(--ease-fluid) group-active:scale-90 group-active:duration-0 motion-reduce:group-active:scale-100" />
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
